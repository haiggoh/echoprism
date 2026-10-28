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
            // Calibrated 2026-10-20 against the real fixture pairs AND the
            // live three-show smoke (1d Phases 2+4, see scorer_tests).
            // Search-sourced videos carry no absolute date and the feeds
            // publish no usable durations, so those two signals sit at their
            // neutral 0.5 for every real pairing: with weights 0.7/0.1/0.1/
            // 0.1 the thinnest real shape (Vergecast's 3-word titles,
            // title 0.75) scores 0.675 and the channel bonus is capped at
            // 0.05 — margins ≥ 0.075 against min_confidence in both
            // directions. The hard gate is min_title_similarity (0.7); with
            // these weights the confidence floor implies title ≥ 0.64, so
            // the title gate always dominates.
            min_confidence: 0.6,
            title_weight: 0.7,
            date_weight: 0.1,
            duration_weight: 0.1,
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
    /// The comparison itself, over content-word lists. Extracted so the
    /// channel-suffix-aware path and the plain path cannot drift apart: two
    /// copies of Jaccard + fuzzy would eventually disagree, and the doc comment
    /// above this function is the only thing that says what "similarity" means.
    fn similarity_of(&self, words1: &[String], words2: &[String]) -> f64 {
        let mut best = 0.0f64;

        if !words1.is_empty() && !words2.is_empty() {
            let set1: std::collections::HashSet<_> = words1.iter().collect();
            let set2: std::collections::HashSet<_> = words2.iter().collect();
            let intersection = set1.intersection(&set2).count();
            let union = set1.union(&set2).count();
            if union > 0 {
                best = intersection as f64 / union as f64;
            }

            // Fuzzy on the joined content words, measured by COVERAGE: the
            // fraction of the longer string the match accounts for. Raw
            // SkimMatcherV2 scores are open-ended (~16 per matched char, not
            // the ~2 the first calibration assumed), so score-based
            // normalization saturated at 1.0 for ANY subsequence match — the
            // live 1d smoke paired "phone" with "rip mitch mcconnell" that
            // way. Coverage keeps identical strings at 1.0 while a few
            // stray subsequence characters score their true fraction.
            // Both argument orders: fuzzy_match(choice, pattern) cannot
            // match a pattern LONGER than the choice.
            let joined1 = words1.join(" ");
            let joined2 = words2.join(" ");
            let longer = joined1.len().max(joined2.len()) as f64;
            let fuzzy_best = [
                self.fuzzy.fuzzy_indices(&joined1, &joined2),
                self.fuzzy.fuzzy_indices(&joined2, &joined1),
            ]
            .into_iter()
            .flatten()
            .map(|(_, indices)| indices.len() as f64 / longer)
            .fold(0.0f64, f64::max);
            if fuzzy_best > best {
                best = fuzzy_best;
            }
        }

        // One-word evidence cannot auto-link: when either title's content
        // words collapse to a single distinct word (the ISO stop list eats
        // e.g. "part", "two", "computer"), all that can remain shared is the
        // show name — the live 1d smoke paired "The Vergecast Vergecast,
        // part two" with "The AI is in the computer | The Vergecast" at
        // jaccard 1.0 that way. Cap below the title gate so such pairs need
        // human confirmation instead.
        let distinct1: std::collections::HashSet<_> = words1.iter().collect();
        let distinct2: std::collections::HashSet<_> = words2.iter().collect();
        if distinct1.len() < 2 || distinct2.len() < 2 {
            best = best.min(0.5);
        }

        best
    }

    pub(crate) fn title_similarity(&self, title1: &str, title2: &str) -> f64 {
        let words1 = self.content_words(title1);
        let words2 = self.content_words(title2);
        self.similarity_of(&words1, &words2)
    }

    pub(crate) fn channel_similarity(&self, ch1: &Option<String>, ch2: &Option<String>) -> f64 {
        match (ch1, ch2) {
            (Some(c1), Some(c2)) => self.title_similarity(c1, c2),
            // A MISSING channel name is neutral, not a penalty. This used to
            // return 0.0, so two titles matching word for word still lost 0.10
            // of confidence purely because the metadata was absent — live-test
            // 2026-10-28: the owner measured 0.85 for an identical pair. Symmetric
            // with date_score's treatment of a missing date, which is already
            // neutral 0.5 for exactly this reason.
            _ => 0.5,
        }
    }

    /// Content words with a trailing segment removed when it spells out the
    /// OTHER side's channel name.
    ///
    /// "Why Billionaires Should Not Exist | Some More News" paired against
    /// "Why Billionaires Should Not Exist", where the other side's channel is
    /// "Some More News": the trailing run IS that channel, so it is the show's
    /// own branding — corroboration that these are the same story on the same
    /// show, not extra content that dilutes the match. Stripping it takes the
    /// pair from 0.78 to 1.00 (live-test 2026-10-28).
    ///
    /// Exact-match only, and only when the trailing run is the WHOLE segment:
    /// an unrelated trailing segment ("… | A Bonus Segment") stays as content,
    /// so this cannot paper over a genuine mismatch.
    fn content_words_minus_channel_suffix(&self, text: &str, other_channel: Option<&str>) -> Vec<String> {
        let mut words = self.content_words(text);
        let Some(channel) = other_channel.filter(|c| !c.trim().is_empty()) else {
            return words;
        };
        let channel_words = self.content_words(channel);
        if channel_words.is_empty() || words.len() <= channel_words.len() {
            return words;
        }
        let tail = &words[words.len() - channel_words.len()..];
        if tail == channel_words.as_slice() {
            words.truncate(words.len() - channel_words.len());
        }
        words
    }

    /// `title_similarity` minus a trailing channel-name segment on either side.
    /// Used where the channel context is known, so a show brace ("| Show")
    /// cannot cost the pair its similarity.
    pub(crate) fn title_similarity_for_pairing(
        &self,
        title1: &str,
        title2: &str,
        channel1: Option<&str>,
        channel2: Option<&str>,
    ) -> f64 {
        let words1 = self.content_words_minus_channel_suffix(title1, channel2);
        let words2 = self.content_words_minus_channel_suffix(title2, channel1);
        self.similarity_of(&words1, &words2)
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
        // Channel-aware: a trailing "| <the other side's channel>" segment is
        // the shared show's own branding, corroboration, not extra content.
        let title_sim = self.title_similarity_for_pairing(
            &podcast.title,
            &video.title,
            podcast.channel_title.as_deref(),
            video.channel_title.as_deref(),
        );
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

    /// Best pairing for one podcast episode across the candidate videos,
    /// applying both gates (title, confidence). Pure — no I/O — so the 1d
    /// live smoke can pair real rows without app state.
    pub(crate) fn best_pairing(
        &self,
        podcast: &PodcastEpisode,
        youtube_videos: &[YoutubeVideo],
        config: &MatchingConfig,
    ) -> Option<BestPairing> {
        let mut best: Option<(f64, f64, &YoutubeVideo)> = None; // (confidence, title_sim, video)
        for video in youtube_videos {
            let title_sim = self.title_similarity_for_pairing(
                &podcast.title,
                &video.title,
                podcast.channel_title.as_deref(),
                video.channel_title.as_deref(),
            );
            // Title gate: the pairing signal is the title. Date/duration
            // coincidence between two unrelated titles must not cross the
            // confidence bar on its own.
            if title_sim < config.min_title_similarity {
                continue;
            }
            let confidence = self.confidence(podcast, video, config);
            if confidence > config.min_confidence && best.as_ref().is_none_or(|(c, _, _)| confidence > *c) {
                best = Some((confidence, title_sim, video));
            }
        }
        best.map(|(confidence, title_similarity, video)| BestPairing {
            video_id: video.id.clone(),
            confidence,
            title_similarity,
            date_diff_days: self.date_diff(podcast.published_at, video.published_at),
            duration_diff_seconds: self.duration_diff(podcast.duration_seconds, video.duration_seconds),
        })
    }
}

/// The outcome of [`Scorer::best_pairing`]: the winning video's link key and
/// the per-signal numbers an `episode_links` row carries.
pub(crate) struct BestPairing {
    pub video_id: String,
    pub confidence: f64,
    pub title_similarity: f64,
    pub date_diff_days: Option<i64>,
    pub duration_diff_seconds: Option<i64>,
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
        let Some(pairing) = self.scorer.best_pairing(podcast, youtube_videos, &self.matching_config) else {
            return Ok(None);
        };
        let now = DateTimeUtc::from(chrono::Utc::now());
        Ok(Some(EpisodeLink {
            id: uuid::Uuid::new_v4().to_string(),
            podcast_guid: podcast.guid.clone(),
            youtube_video_id: pairing.video_id,
            confidence: pairing.confidence,
            matched_at: now,
            matched_by: MatchSource::Auto,
            title_similarity: Some(pairing.title_similarity),
            date_diff_days: pairing.date_diff_days,
            duration_diff_seconds: pairing.duration_diff_seconds,
            user_confirmed: false,
            created_at: now,
            updated_at: now,
        }))
    }
}

#[cfg(test)]
mod scorer_tests {
    use super::*;

    fn scorer() -> Scorer {
        Scorer::new()
    }

    // ---- Live-test 2026-10-28: confidence that reads honestly ----
    // The owner: "just those confidence ratios are surprisingly low. if a see
    // two titles that are word for word letter for letter identical, and they
    // both carry the name of the same show, shouldn't that be a 100% match
    // rather than only 85%? and the 73% items seem highly likely too, the only
    // difference I'm seeing is that one is the plain episode name whilst the
    // other adds the name of the channel at the end (pipe separated)".
    //
    // Measured on the real scorer before any change:
    //   identical titles + same show + same length .............. 0.900
    //   identical titles, NO channel metadata on either side .... 0.800
    //   "Why Billionaires Should Not Exist"
    //     vs "Why Billionaires Should Not Exist | Some More News" 0.748
    //
    // Two defects, both principled:
    //  1. ABSENT DATA WAS PUNISHED. channel_similarity returned 0.0 when
    //     either side had no channel name, so a missing signal scored as
    //     evidence AGAINST — while date_score correctly treats a missing date
    //     as neutral 0.5. Two titles matching word for word lost 0.10 purely
    //     because the metadata was absent. A missing signal must be neutral.
    //  2. A TRAILING CHANNEL NAME WAS COUNTED AS EXTRA CONTENT. "… | Show Name"
    //     is a formatting convention of the SAME show — corroboration, not a
    //     mismatch. Word-set Jaccard scored it as pure extra words and dropped
    //     the pair to 0.78.

    #[test]
    fn a_missing_channel_signal_is_neutral_not_a_penalty() {
        let sc = scorer();
        let cfg = MatchingConfig::default();

        // The signal itself: absent must read as neutral, exactly as
        // date_score treats an absent date. It used to be 0.0 — absent data
        // scored as evidence AGAINST.
        assert_eq!(sc.channel_similarity(&None, &None), 0.5);
        assert_eq!(sc.channel_similarity(&Some("Some More News".into()), &None), 0.5);
        assert_eq!(sc.channel_similarity(&None, &Some("Some More News".into())), 0.5);

        // And the effect: identical titles, no channel metadata, nothing else
        // known. Was 0.800 (0.10 lost to the punishment); now 0.850 — the
        // remaining gap is the neutral date and duration, which is honest.
        let p = pod("Why Billionaires Should Not Exist");
        let v = vid("Why Billionaires Should Not Exist");
        let confidence = sc.confidence(&p, &v, &cfg);
        assert!(
            (confidence - 0.85).abs() < 1e-9,
            "expected 0.850 (title 1.0 + neutral date/duration/channel). Got {confidence:.3}"
        );
    }

    #[test]
    fn an_identical_pair_with_the_same_show_scores_as_near_certain() {
        // The owner's actual case: "two titles that are word for word letter
        // for letter identical, and they both carry the name of the same show".
        let sc = scorer();
        let cfg = MatchingConfig::default();
        let mut p = pod("Why Billionaires Should Not Exist");
        p.channel_title = Some("Some More News".into());
        p.duration_seconds = Some(1600);
        let mut v = vid("Why Billionaires Should Not Exist");
        v.channel_title = Some("Some More News".into());
        v.duration_seconds = Some(1600);

        let confidence = sc.confidence(&p, &v, &cfg);
        assert!(
            confidence >= 0.9,
            "the same episode, same show, same length must read as near-certain. \
             Got {confidence:.3}"
        );
    }

    #[test]
    fn a_trailing_channel_name_is_not_counted_as_extra_words() {
        let sc = scorer();
        let cfg = MatchingConfig::default();
        let mut p = pod("Why Billionaires Should Not Exist");
        p.channel_title = Some("Some More News".into());
        p.duration_seconds = Some(1600);
        let mut v = vid("Why Billionaires Should Not Exist | Some More News");
        v.channel_title = Some("Some More News".into());
        v.duration_seconds = Some(1600);

        // NOTE: title_similarity (plain) deliberately does NOT strip the suffix
        // — it is also used channel-to-channel, where there is no "other side"
        // to corroborate against. The channel-aware path is the one the pairing
        // uses, and that is what must see the two titles as the same words.
        assert_eq!(
            sc.title_similarity_for_pairing(
                &p.title,
                &v.title,
                p.channel_title.as_deref(),
                v.channel_title.as_deref(),
            ),
            1.0,
            "a trailing '| <the same channel>' segment must not lower title similarity"
        );
        let confidence = sc.confidence(&p, &v, &cfg);
        assert!(
            confidence >= 0.9,
            "the same episode on two streams must score as a near-certain match. \
             Got {confidence:.3}"
        );
    }

    #[test]
    fn a_trailing_name_that_is_not_the_channel_still_counts() {
        // The guard on the fix: only the suffix naming the OTHER side's channel
        // is treated as boilerplate. A genuinely different trailing segment is
        // still extra content, so the rule cannot paper over a mismatch.
        let sc = scorer();
        let mut p = pod("Why Billionaires Should Not Exist");
        p.channel_title = Some("Some More News".into());
        let mut v = vid("Why Billionaires Should Not Exist | A Bonus Segment");
        v.channel_title = Some("Some More News".into());

        assert!(
            sc.title_similarity(&p.title, &v.title) < 1.0,
            "an unrelated trailing segment is still extra content, not boilerplate"
        );
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
    /// its YouTube titles share no words with its podcast titles). The last
    /// four are REAL false pairs the 1d live smoke produced before the fuzzy
    /// normalization was fixed — short content sets whose words are loose
    /// subsequences of the other title.
    #[test]
    fn cross_show_titles_stay_below_the_title_gate() {
        let s = scorer();
        for (video_title, podcast_title) in [
            ("Billionaires Are Funding 'Anti AI' Content", "Even More News: JD Vance’s Town Hall Was a Disaster"),
            ("People Are Secretly Dating AI And Wont Stop", "Why your favorite creator is building an app"),
            ("Is social media destroying kids mental health? // Power User podcast", "Apple's HomeView has an app problem"),
            ("AGI is whatever you want it to be | The Vergecast", "Why your favorite creator is building an app"),
            // Live-smoke false pairs (2026-10-20): subsequence fuzzy saturation.
            ("RIP Mitch McConnell", "Here's what an AI-first phone might look like"),
            ("Why your favorite creator is building an app | The Vergecast", "Everything's recording everybody. What now?"),
            ("The Vergecast", "The folding iPhone Duo is finally here | The Vergecast Livestream"),
            ("Why your favorite creator is building an app | The Vergecast", "Why read anymore?"),
        ] {
            let sim = s.title_similarity(video_title, podcast_title);
            assert!(
                sim <= 0.4,
                "cross-show pair must stay far below the gate: {:?} vs {:?} scored {:.3}",
                video_title, podcast_title, sim
            );
        }

        // Same-show, different-episode: both titles collapse to the show
        // name once the stop list takes "part"/"two"/"computer". The
        // one-word cap lands exactly on 0.5 — below the 0.7 gate, but the
        // bound here is the CAP, not the cross-show floor.
        let s = scorer();
        let sim = s.title_similarity(
            "The AI is in the computer | The Vergecast",
            "The Vergecast Vergecast, part two",
        );
        assert!(
            sim <= 0.5,
            "one-word-collapse pair must stay capped, scored {:.3}",
            sim
        );
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
    /// signal scores exactly 1.0, not 1.2 clamped. Channel titles carry two
    /// content words ("same" is a stop word; one-word names would trip the
    /// one-word cap, which is a different behavior).
    #[test]
    fn confidence_is_normalized_to_one() {
        let s = scorer();
        let config = MatchingConfig::default();
        let mut podcast = pod("Apple's HomeView has an app problem");
        podcast.channel_title = Some("Channel Creator".into());
        let published = DateTimeUtc::new(chrono::Utc::now());
        podcast.published_at = Some(published);
        podcast.duration_seconds = Some(1000);
        let mut video = vid("Apple's HomeView has an app problem");
        video.channel_title = Some("Channel Creator".into());
        video.published_at = Some(published);
        video.duration_seconds = Some(1000);
        let confidence = s.confidence(&podcast, &video, &config);
        assert!(
            (confidence - 1.0).abs() < 1e-9,
            "perfect candidate must score exactly 1.0, scored {:.6}",
            confidence
        );
    }

    /// best_pairing applies both gates and picks the higher-confidence of
    /// two viable candidates.
    #[test]
    fn best_pairing_picks_viable_and_best() {
        let s = scorer();
        let config = MatchingConfig::default();

        // Two viable vergecast-shaped videos, one clearly better (identical
        // title vs identical + extra word).
        let podcast = pod("Apple's HomeView has an app problem");
        let v1 = vid("Apple's HomeView has an app problem | The Vergecast");
        let mut v2 = vid("Apple's HomeView has an app problem | The Vergecast (Oct 16)");
        v2.id = "vid-2".into();
        v2.video_id = "vid-2".into();
        let videos = vec![v1, v2];
        let pairing = s.best_pairing(&podcast, &videos, &config).expect("a pairing exists");
        assert_eq!(pairing.video_id, "vid-1");
        assert!(pairing.confidence >= config.min_confidence);
        assert!(pairing.title_similarity >= config.min_title_similarity);

        // Only gated-out candidates: no pairing.
        let unrelated = vec![vid("Billionaires Are Funding 'Anti AI' Content")];
        assert!(s.best_pairing(&podcast, &unrelated, &config).is_none());
    }

    /// Calibration matrix printer: run with
    /// `cargo test --lib calibration_matrix -- --nocapture` after capturing
    /// new fixtures to re-derive the thresholds from measured scores.
    #[test]
    fn calibration_matrix() {        let s = scorer();
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
