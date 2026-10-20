//! Smart Episode Linking - matches podcast episodes to YouTube videos

use crate::types::*;
use crate::db::Database;
use tauri::{AppHandle, Manager};
use std::sync::Arc;
use fuzzy_matcher::FuzzyMatcher;
use stop_words::get;
use stop_words::LANGUAGE;

#[derive(Clone)]
pub struct MatchingConfig {
    pub min_confidence: f64,
    pub title_weight: f64,
    pub date_weight: f64,
    pub duration_weight: f64,
    pub channel_weight: f64,
    /// Reserved for transcript-based similarity; 0 until transcripts exist.
    /// (The old code hardcoded a 0.5 content score at weight 0.1 — a
    /// constant bias that inflated every candidate equally.)
    pub content_weight: f64,
    pub max_date_diff_days: i64,
    pub max_duration_diff_seconds: u64,
    /// Gate on the title signal alone: date/duration coincidence between two
    /// unrelated titles must never manufacture a pairing.
    pub min_title_similarity: f64,
}

impl Default for MatchingConfig {
    fn default() -> Self {
        Self {
            // Calibrated 2026-10-20 against the real fixture pairs (1d Phase
            // 2, see scorer_tests): genuine pairs score 0.73-1.0 (the
            // Vergecast shape lands lowest — search videos carry no absolute
            // date and the feed publishes no durations, so both signals sit
            // at their neutral 0.5), cross-show pairs at most 0.3. 0.65 keeps
            // both margins wide; the hard gate is min_title_similarity.
            min_confidence: 0.65,
            title_weight: 0.6,
            date_weight: 0.2,
            duration_weight: 0.2,
            channel_weight: 0.1,
            content_weight: 0.0,
            max_date_diff_days: 3,
            max_duration_diff_seconds: 60,
            min_title_similarity: 0.7,
        }
    }
}

/// Pure title/date/duration scoring, extracted from `EpisodeMatcher` so the
/// calibration against the real show fixtures (1d Phase 2) is testable
/// without a Tauri app state. Holds no I/O — every method is deterministic.
pub(crate) struct Scorer {
    fuzzy: fuzzy_matcher::skim::SkimMatcherV2,
    stop_words: std::collections::HashSet<String>,
}

impl Scorer {
    pub(crate) fn new() -> Self {
        Self {
            fuzzy: fuzzy_matcher::skim::SkimMatcherV2::default(),
            stop_words: get(LANGUAGE::English).into_iter().collect(),
        }
    }

    /// Content words of a title: lowercased, split on non-alphanumeric
    /// characters (punctuation, apostrophes — the fixtures use U+2019), stop
    /// words and 1-2 char fragments dropped. These feed Jaccard.
    ///
    /// 1d Phase 2 fix: the original filter was inverted — it KEPT words that
    /// are stop words and dropped everything else, so the Jaccard fallback
    /// compared nothing but "the/of/and". Real pairs now score on their
    /// content words (see `scorer_tests`).
    pub(crate) fn content_words(&self, text: &str) -> Vec<String> {
        text.to_lowercase()
            .split(|c: char| !c.is_alphanumeric())
            .filter(|w| w.len() > 2 && !self.stop_words.contains(*w))
            .map(|w| w.to_string())
            .collect()
    }

    /// Similarity of two titles in [0, 1]. Primary signal: Jaccard over the
    /// content-word sets, which is exact and robust to the real pairing
    /// shapes in the committed fixtures (identical + " | The Vergecast"
    /// suffix, "Even More News: " prefix, " - SOME MORE NEWS" suffix).
    /// Secondary: fuzzy match over the joined content words, for near-misses
    /// Jaccard cannot see ("verge" vs "vergecast"). The final score is the
    /// larger of the two.
    pub(crate) fn title_similarity(&self, title1: &str, title2: &str) -> f64 {
        let words1 = self.content_words(title1);
        let words2 = self.content_words(title2);

        let mut best = 0.0f64;

        if !words1.is_empty() && !words2.is_empty() {
            let set1: std::collections::HashSet<_> = words1.iter().collect();
            let set2: std::collections::HashSet<_> = words2.iter().collect();
            let intersection = set1.intersection(&set2).count();
            let union = set1.union(&set2).count();
            if union > 0 {
                best = intersection as f64 / union as f64;
            }

            // Fuzzy on the joined content words. SkimMatcherV2 scores are
            // open-ended, so normalize by the best achievable score for the
            // longer string (a perfect match of n chars scores ~2n: 1 per
            // matched char plus bonuses). Both argument orders are tried:
            // fuzzy_match(choice, pattern) cannot match a pattern LONGER
            // than the choice (measured in calibration_matrix: "the verge"
            // vs "the vergecast" scored 0 in one direction only).
            let joined1 = words1.join(" ");
            let joined2 = words2.join(" ");
            let longer = joined1.len().max(joined2.len()) as f64;
            let fuzzy_best = [
                self.fuzzy.fuzzy_match(&joined1, &joined2),
                self.fuzzy.fuzzy_match(&joined2, &joined1),
            ]
            .into_iter()
            .flatten()
            .map(|score| (score as f64 / (2.0 * longer)).clamp(0.0, 1.0))
            .fold(0.0f64, f64::max);
            if fuzzy_best > best {
                best = fuzzy_best;
            }
        }

        best
    }

    pub(crate) fn channel_similarity(&self, ch1: &Option<String>, ch2: &Option<String>) -> f64 {
        match (ch1, ch2) {
            (Some(c1), Some(c2)) => self.title_similarity(c1, c2),
            _ => 0.0,
        }
    }

    /// 1.0 same day, linearly down to 0 at `max_date_diff_days`, 0 beyond.
    /// A missing date on EITHER side is neutral 0.5 — common for search rows,
    /// which store no absolute date (relative-date premise, 1b).
    pub(crate) fn date_score(
        &self,
        date1: Option<DateTimeUtc>,
        date2: Option<DateTimeUtc>,
        config: &MatchingConfig,
    ) -> f64 {
        match (date1, date2) {
            (Some(d1), Some(d2)) => {
                let diff = (d1.inner() - d2.inner()).num_days().abs();
                if diff <= config.max_date_diff_days {
                    1.0 - (diff as f64 / config.max_date_diff_days as f64)
                } else {
                    0.0
                }
            }
            _ => 0.5, // Unknown dates get neutral score
        }
    }

    /// 1.0 same duration, linearly down to 0 at `max_duration_diff_seconds`.
    /// A zero duration (unknown) on EITHER side is neutral 0.5.
    pub(crate) fn duration_score(&self, dur1: u64, dur2: u64, config: &MatchingConfig) -> f64 {
        if dur1 == 0 || dur2 == 0 {
            return 0.5;
        }

        let diff = if dur1 > dur2 { dur1 - dur2 } else { dur2 - dur1 };
        if diff <= config.max_duration_diff_seconds {
            1.0 - (diff as f64 / config.max_duration_diff_seconds as f64)
        } else {
            0.0
        }
    }

    /// Weighted combination, divided by the total weight so the scale is an
    /// honest 0-1. (The old sum of weights was 1.2 silently clamped to 1.0.)
    pub(crate) fn confidence(
        &self,
        podcast: &PodcastEpisode,
        video: &YoutubeVideo,
        config: &MatchingConfig,
    ) -> f64 {
        let title_sim = self.title_similarity(&podcast.title, &video.title);
        let date_score = self.date_score(podcast.published_at, video.published_at, config);
        let duration_score = self.duration_score(
            podcast.duration_seconds.unwrap_or(0),
            video.duration_seconds.unwrap_or(0),
            config,
        );
        let channel_score = self.channel_similarity(&podcast.channel_title, &video.channel_title);

        let total = config.title_weight
            + config.date_weight
            + config.duration_weight
            + config.channel_weight
            + config.content_weight;
        if total <= 0.0 {
            return 0.0;
        }

        let weighted = config.title_weight * title_sim
            + config.date_weight * date_score
            + config.duration_weight * duration_score
            + config.channel_weight * channel_score;

        (weighted / total).clamp(0.0, 1.0)
    }

    pub(crate) fn date_diff(&self, d1: Option<DateTimeUtc>, d2: Option<DateTimeUtc>) -> Option<i64> {
        match (d1, d2) {
            (Some(d1), Some(d2)) => Some((d1.inner() - d2.inner()).num_days()),
            _ => None,
        }
    }

    pub(crate) fn duration_diff(&self, d1: Option<u64>, d2: Option<u64>) -> Option<i64> {
        match (d1, d2) {
            (Some(d1), Some(d2)) => Some(if d1 > d2 { (d1 - d2) as i64 } else { (d2 - d1) as i64 }),
            _ => None,
        }
    }
}

pub struct EpisodeMatcher {
    db: Arc<Database>,
    scorer: Scorer,
    matching_config: MatchingConfig,
}

impl EpisodeMatcher {
    pub fn new(
        app_handle: AppHandle,
        config: Option<MatchingConfig>,
    ) -> Self {
        let db = app_handle.state::<Arc<Database>>().inner().clone();

        Self {
            db: db,
            scorer: Scorer::new(),
            matching_config: config.unwrap_or_default(),
        }
    }

    /// Match all unlinked podcast episodes to YouTube videos
    pub async fn match_all(&self) -> Result<MatchResult, String> {
        let unmatched_podcasts = self.db.get_unmatched_podcasts().await?;
        let youtube_videos = self.db.get_youtube_videos().await?;

        let mut matched = 0;
        let mut errors: Vec<String> = Vec::new();

        for podcast in unmatched_podcasts {
            match self.find_best_match(&podcast, &youtube_videos).await {
                Ok(Some(link)) => {
                    self.db.insert_episode_link(&link).await?;
                    matched += 1;
                }
                Ok(None) => {}
                Err(e) => errors.push(format!("{}: {}", podcast.guid, e)),
            }
        }

        if !errors.is_empty() {
            tracing::warn!("Smart linking had {} failure(s): {}", errors.len(), errors.join("; "));
        }

        Ok(MatchResult { matched_count: matched })
    }

    /// Find best YouTube match for a podcast episode
    async fn find_best_match(
        &self,
        podcast: &PodcastEpisode,
        youtube_videos: &[YoutubeVideo],
    ) -> Result<Option<EpisodeLink>, String> {
        let mut best_match = None;
        let mut best_confidence = 0.0;

        for video in youtube_videos {
            let title_sim = self.scorer.title_similarity(&podcast.title, &video.title);

            // Title gate: the pairing signal is the title. Date/duration
            // coincidence between two unrelated titles must not cross the
            // confidence bar on its own (this also gives the previously dead
            // `min_title_similarity` config its real job).
            if title_sim < self.matching_config.min_title_similarity {
                continue;
            }

            let confidence = self.scorer.confidence(podcast, video, &self.matching_config);

            if confidence > self.matching_config.min_confidence && confidence > best_confidence {
                best_confidence = confidence;
                let now = DateTimeUtc::from(chrono::Utc::now());
                best_match = Some(EpisodeLink {
                    id: uuid::Uuid::new_v4().to_string(),
                    podcast_guid: podcast.guid.clone(),
                    youtube_video_id: video.id.clone(),
                    confidence,
                    matched_at: now,
                    matched_by: MatchSource::Auto,
                    title_similarity: Some(title_sim),
                    date_diff_days: self.scorer.date_diff(podcast.published_at, video.published_at),
                    duration_diff_seconds: self.scorer.duration_diff(podcast.duration_seconds, video.duration_seconds),
                    user_confirmed: false,
                    created_at: now,
                    updated_at: now,
                });
            }
        }

        Ok(best_match)
    }
}

#[cfg(test)]
mod scorer_tests {
    use super::*;

    fn scorer() -> Scorer {
        Scorer::new()
    }

    fn pod(title: &str) -> PodcastEpisode {
        PodcastEpisode {
            id: "pod-1".into(),
            guid: "pod-guid-1".into(),
            title: title.into(),
            description: None,
            channel_title: None,
            channel_id: None,
            published_at: None,
            duration_seconds: None,
            audio_url: None,
            transcript: None,
        }
    }

    fn vid(title: &str) -> YoutubeVideo {
        YoutubeVideo {
            id: "vid-1".into(),
            video_id: "vid-1".into(),
            title: title.into(),
            channel_title: None,
            channel_id: None,
            published_at: None,
            duration_seconds: None,
            description: None,
            thumbnail_url: None,
        }
    }

    /// The 1d Phase 2 discriminant: stop words are DROPPED, content words
    /// kept. (The pre-fix filter was inverted and kept exactly the stop
    /// words, so the Jaccard fallback scored titles on "the/of/and".)
    #[test]
    fn content_words_drops_stop_words_keeps_content() {
        let s = scorer();
        assert!(s.content_words("the was and of a to").is_empty());
        let words = s.content_words("JD Vance’s Town Hall Was a Disaster");
        assert_eq!(words, vec!["vance", "town", "hall", "disaster"]);
    }

    #[test]
    fn content_words_split_on_punctuation_and_unicode_apostrophes() {
        let s = scorer();
        // U+2019 (’) as used by the real feeds, pipe separators, question
        // marks. "problem" is absent because the crate's 1298-word ISO list
        // really does list it as a stop word (probed 2026-10-20); every
        // content noun the real fixture pairs rely on is kept.
        let words = s.content_words("Apple's HomeView has an app problem | The Vergecast");
        assert_eq!(words, vec!["apple", "homeview", "app", "vergecast"]);
        assert!(s.content_words("Is social media destroying kids mental health?").contains(&"mental".to_string()));
    }

    /// Real pairing shapes from the committed 1d Phase 0 fixtures: every
    /// genuine same-episode pair must clear the title gate (0.7).
    #[test]
    fn real_title_pairs_clear_the_title_gate() {
        let s = scorer();
        for (video_title, podcast_title) in [
            // Vergecast: podcast title + " | The Vergecast"
            ("Apple's HomeView has an app problem | The Vergecast", "Apple's HomeView has an app problem"),
            ("Why your favorite creator is building an app | The Vergecast", "Why your favorite creator is building an app"),
            // Some More News: "Even More News: " prefix on the podcast side
            ("JD Vance’s Town Hall Was a Disaster", "Even More News: JD Vance’s Town Hall Was a Disaster"),
            // Some More News videos: " - SOME MORE NEWS" suffix
            ("Our Fake Thanksgiving - SOME MORE NEWS", "Some More News: Our Fake Thanksgiving"),
        ] {
            let sim = s.title_similarity(video_title, podcast_title);
            assert!(
                sim >= 0.7,
                "real pair must clear the title gate: {:?} vs {:?} scored {:.3}",
                video_title, podcast_title, sim
            );
        }
    }

    /// Cross-show and different-episode titles must stay well below the gate
    /// so they can never pair (the Power User fixture is the honest negative:
    /// its YouTube titles share no words with its podcast titles).
    #[test]
    fn cross_show_titles_stay_below_the_title_gate() {
        let s = scorer();
        for (video_title, podcast_title) in [
            ("Billionaires Are Funding 'Anti AI' Content", "Even More News: JD Vance’s Town Hall Was a Disaster"),
            ("People Are Secretly Dating AI And Wont Stop", "Why your favorite creator is building an app"),
            ("Is social media destroying kids mental health? // Power User podcast", "Apple's HomeView has an app problem"),
            ("AGI is whatever you want it to be | The Vergecast", "Why your favorite creator is building an app"),
        ] {
            let sim = s.title_similarity(video_title, podcast_title);
            assert!(
                sim <= 0.4,
                "cross-show pair must stay far below the gate: {:?} vs {:?} scored {:.3}",
                video_title, podcast_title, sim
            );
        }
    }

    /// Confidence for a real pair shaped like the DB rows (search video: no
    /// absolute date; feed podcast: no duration element) must clear
    /// min_confidence, and a cross-show pair must not.
    #[test]
    fn confidence_separates_real_pairs_from_cross_show() {
        let s = scorer();
        let config = MatchingConfig::default();

        // Real-shape Vergecast pair: channel titles "The Verge" / "The Vergecast".
        let mut podcast = pod("Apple's HomeView has an app problem");
        podcast.channel_title = Some("The Vergecast".into());
        podcast.published_at = Some(DateTimeUtc::new(chrono::Utc::now()));
        let mut video = vid("Apple's HomeView has an app problem | The Vergecast");
        video.channel_title = Some("The Verge".into());
        video.duration_seconds = Some(5911);
        let confidence = s.confidence(&podcast, &video, &config);
        assert!(
            confidence >= config.min_confidence,
            "real Vergecast pair must reach min_confidence, scored {:.3}",
            confidence
        );

        // Real-shape SMN pair, both durations known and within tolerance.
        let mut podcast = pod("Even More News: JD Vance’s Town Hall Was a Disaster");
        podcast.channel_title = Some("Even More News".into());
        podcast.published_at = Some(DateTimeUtc::new(chrono::Utc::now()));
        podcast.duration_seconds = Some(2000);
        let mut video = vid("JD Vance’s Town Hall Was a Disaster");
        video.channel_title = Some("Some More News".into());
        video.duration_seconds = Some(2000);
        let confidence = s.confidence(&podcast, &video, &config);
        assert!(
            confidence >= config.min_confidence,
            "real SMN pair must reach min_confidence, scored {:.3}",
            confidence
        );

        // Cross-show pair with coincidentally identical durations: the title
        // gate (applied in find_best_match) plus low confidence must reject it.
        let mut podcast = pod("Billionaires Are Funding 'Anti AI' Content");
        podcast.channel_title = Some("Power User".into());
        podcast.published_at = Some(DateTimeUtc::new(chrono::Utc::now()));
        podcast.duration_seconds = Some(2000);
        let mut video = vid("Even More News: JD Vance’s Town Hall Was a Disaster");
        video.channel_title = Some("Some More News".into());
        video.duration_seconds = Some(2000);
        let confidence = s.confidence(&podcast, &video, &config);
        assert!(
            confidence < config.min_confidence,
            "cross-show pair must stay below min_confidence, scored {:.3}",
            confidence
        );
    }

    /// The weight sum must normalize to 1: a candidate perfect on every
    /// signal scores exactly 1.0, not 1.2 clamped.
    #[test]
    fn confidence_is_normalized_to_one() {
        let s = scorer();
        let config = MatchingConfig::default();
        let mut podcast = pod("Apple's HomeView has an app problem");
        podcast.channel_title = Some("Same Channel".into());
        let published = DateTimeUtc::new(chrono::Utc::now());
        podcast.published_at = Some(published);
        podcast.duration_seconds = Some(1000);
        let mut video = vid("Apple's HomeView has an app problem");
        video.channel_title = Some("Same Channel".into());
        video.published_at = Some(published);
        video.duration_seconds = Some(1000);
        let confidence = s.confidence(&podcast, &video, &config);
        assert!(
            (confidence - 1.0).abs() < 1e-9,
            "perfect candidate must score exactly 1.0, scored {:.6}",
            confidence
        );
    }

    /// Calibration matrix printer: run with
    /// `cargo test --lib calibration_matrix -- --nocapture` after capturing
    /// new fixtures to re-derive the thresholds from measured scores.
    #[test]
    fn calibration_matrix() {
        let s = scorer();
        println!("== title_similarity (video | podcast) ==");
        for (video_title, podcast_title) in [
            ("Apple's HomeView has an app problem | The Vergecast", "Apple's HomeView has an app problem"),
            ("Why your favorite creator is building an app | The Vergecast", "Why your favorite creator is building an app"),
            ("JD Vance’s Town Hall Was a Disaster", "Even More News: JD Vance’s Town Hall Was a Disaster"),
            ("Our Fake Thanksgiving - SOME MORE NEWS", "Some More News: Our Fake Thanksgiving"),
            ("Billionaires Are Funding 'Anti AI' Content", "Even More News: JD Vance’s Town Hall Was a Disaster"),
            ("People Are Secretly Dating AI And Wont Stop", "Why your favorite creator is building an app"),
            ("Is social media destroying kids mental health? // Power User podcast", "Apple's HomeView has an app problem"),
            ("AGI is whatever you want it to be | The Vergecast", "Why your favorite creator is building an app"),
        ] {
            let sim = s.title_similarity(video_title, podcast_title);
            println!("{:>6.3}  {:50} | {}", sim, video_title, podcast_title);
        }
        println!("== channel_similarity ==");
        for (a, b) in [("The Verge", "The Vergecast"), ("Some More News", "Even More News"), ("Power User", "Power User")] {
            let sim = s.title_similarity(a, b);
            println!("{:>6.3}  {} | {}", sim, a, b);
        }
    }
}
