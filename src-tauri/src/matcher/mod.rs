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
    /// Owner 2026-11-04 round 3: when BOTH sides carry a publish date, pairs
    /// further apart than this are skipped outright (+/- 2 days) — dates are
    /// the strongest disambiguator against title-similar but different
    /// episodes ("iPhone X Review" vs "iPhone Duo review (emotional)").
    pub date_hard_gate_days: Option<i64>,
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
            date_hard_gate_days: Some(2),
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
    /// Two content words match if equal, or if the shorter (>= 4 chars) is
    /// FULLY covered by a fuzzy subsequence match into the longer — so
    /// "verge"~"vergecast" matches but "x"~"duo" does not. Word-level, not
    /// char-level: the old joined-string coverage fuzzy saturated at 1.0 for
    /// any subsequence and paired "phone" with "rip mitch mcconnell"
    /// (live 1d smoke), and still let "iPhone X Review" pair with "iPhone Duo
    /// review (emotional)" (owner round 3 false positive).
    fn words_match(&self, a: &str, b: &str) -> bool {
        if a == b {
            return true;
        }
        let (shorter, longer) = if a.len() <= b.len() { (a, b) } else { (b, a) };
        if shorter.chars().count() < 4 {
            return false;
        }
        self.fuzzy
            .fuzzy_indices(shorter, longer)
            .map_or(false, |(_, idx)| idx.len() == shorter.chars().count())
    }

    fn similarity_of(&self, words1: &[String], words2: &[String]) -> f64 {
        let mut best = 0.0f64;

        if !words1.is_empty() && !words2.is_empty() {
            // Greedy bipartite word match: exact first, then fuzzy —
            // Jaccard over the matched words.
            let mut used2 = vec![false; words2.len()];
            let mut matched = 0usize;
            for w1 in words1 {
                if let Some((i, _)) = words2.iter().enumerate().find(|(i, w2)| !used2[*i] && w1 == *w2) {
                    used2[i] = true;
                    matched += 1;
                    continue;
                }
                if let Some((i, _)) = words2.iter().enumerate().find(|(i, w2)| !used2[*i] && self.words_match(w1, w2)) {
                    used2[i] = true;
                    matched += 1;
                }
            }
            let union = words1.len() + words2.len() - matched;
            if union > 0 {
                best = matched as f64 / union as f64;
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

    /// Content words with a show-branding segment removed when it spells out
    /// the OTHER side's channel name — in EITHER position, behind ANY divider.
    ///
    /// "Why Billionaires Should Not Exist | Some More News" paired against
    /// "Why Billionaires Should Not Exist", where the other side's channel is
    /// "Some More News": the trailing run IS that channel, so it is the show's
    /// own branding — corroboration that these are the same story on the same
    /// show, not extra content that dilutes the match. Stripping it takes the
    /// pair from 0.78 to 1.00 (live-test 2026-10-28). The same holds for the
    /// prefix placement ("Some More News: Why Billionaires…") and for every
    /// divider YouTube creators use (`|`, `-`, `–`, `—`, `:`) — content_words
    /// splits on all non-alphanumerics, so the divider never reaches the word
    /// list and only the placement matters (live-test batch 2 Task 4a,
    /// 2026-10-28 owner report).
    ///
    /// Exact-match only, and only when the run is the WHOLE segment and at
    /// least one content word remains: an unrelated segment ("… | A Bonus
    /// Segment") stays as content, so this cannot paper over a mismatch.
    fn strip_show_branding(&self, text: &str, other_channel: Option<&str>) -> Vec<String> {
        let mut words = self.content_words(text);
        let Some(channel) = other_channel.filter(|c| !c.trim().is_empty()) else {
            return words;
        };
        let channel_words = self.content_words(channel);
        if channel_words.is_empty() || words.len() <= channel_words.len() {
            return words;
        }
        let n = channel_words.len();
        let tail = &words[words.len() - n..];
        if tail == channel_words.as_slice() {
            words.truncate(words.len() - n);
        } else {
            let head = &words[..n];
            if head == channel_words.as_slice() {
                words.drain(..n);
            }
        }
        words
    }

    /// Dividers YouTube creators actually put between episode title and show
    /// branding. `content_words` splits on every non-alphanumeric, so the
    /// divider itself never reaches the word list — segment splitting has to
    /// happen on the raw title first.
    const BRANDING_DIVIDERS: &[char] = &['|', '-', '–', '—', ':', '/', '(', ')', '[', ']'];

    /// Does a divider-delimited segment look like show/site BRANDING rather
    /// than content? Owner pattern rule (2026-11-03 live run, handover batch-2
    /// Task 4 quote): "X" vs "X | The Vergecast" is the same episode — the
    /// segment is branding when it is a single content word ("| Vergecast"),
    /// or shares a >=4-char stem with either known channel name ("The
    /// Vergecast Special" vs channel "The Verge"). A multi-word segment with
    /// no channel affinity ("A Bonus Segment") is NOT branding — pinned by
    /// an_unrelated_leading/trailing_segment_still_counts.
    fn looks_like_branding(&self, seg_words: &[String], channels: &[Option<&str>]) -> bool {
        if seg_words.is_empty() {
            return false;
        }
        // Owner 2026-11-03 round 2: livestream flags live in the TITLE on one
        // side only ("… | Livestream", "… (Livestream)") — clearly the same
        // episode to a human, so tag-only segments are branding.
        const TAG_WORDS: &[&str] = &["livestream", "live"];
        if seg_words.iter().all(|w| TAG_WORDS.contains(&w.as_str())) {
            return true;
        }
        // Owner 2026-11-04 round 3: a bare single word is NOT automatically
        // branding — "(emotional)" paired against channels The Verge/Vergecast
        // must not strip (it is content, and the pair is a false positive).
        // A segment is branding only via tag words, exact channel name, or a
        // shared >=4-char stem with a known channel ("Vergecast" ~ "Verge").
        for ch in channels.iter().flatten() {
            for cw in self.content_words(ch) {
                for sw in seg_words {
                    if cw.len() >= 4 && sw.len() >= 4 && (sw.starts_with(&cw) || cw.starts_with(sw)) {
                        return true;
                    }
                }
            }
        }
        false
    }

    /// Content words of `text` with a leading/trailing branding segment
    /// removed when one is present: first the exact channel-name rule (any
    /// known channel, either position), then the divider-segment pattern rule.
    fn strip_any_branding(&self, text: &str, channels: &[Option<&str>]) -> Vec<String> {
        let base = self.content_words(text);
        for ch in channels.iter().flatten() {
            let w = self.strip_show_branding(text, Some(ch));
            if w != base {
                return w;
            }
        }
        let segments: Vec<&str> = text
            .split(|c| Self::BRANDING_DIVIDERS.contains(&c))
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .collect();
        if segments.len() < 2 {
            return base;
        }
        let last_seg = self.content_words(segments.last().unwrap());
        if self.looks_like_branding(&last_seg, channels) {
            return self.content_words(&segments[..segments.len() - 1].join(" "));
        }
        let first_seg = self.content_words(segments.first().unwrap());
        if self.looks_like_branding(&first_seg, channels) {
            return self.content_words(&segments[1..].join(" "));
        }
        base
    }

    /// `title_similarity` minus a show-branding segment on either side.
    /// Used where the channel context is known, so a show brace ("| Show")
    /// cannot cost the pair its similarity. The one-word guard inside
    /// `similarity_of` still caps pairs whose remaining evidence is a single
    /// word, so the strip can never manufacture certainty from nothing.
    pub(crate) fn title_similarity_for_pairing(
        &self,
        title1: &str,
        title2: &str,
        channel1: Option<&str>,
        channel2: Option<&str>,
    ) -> f64 {
        let channels = [channel1, channel2];
        let words1 = self.strip_any_branding(title1, &channels);
        let words2 = self.strip_any_branding(title2, &channels);
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
        channels_linked: bool,
    ) -> f64 {
        // Channel-aware: a trailing "| <the other side's channel>" segment is
        // the shared show's own branding, corroboration, not extra content.
        let title_sim = self.title_similarity_for_pairing(
            &podcast.title,
            &video.title,
            podcast.channel_title.as_deref(),
            video.channel_title.as_deref(),
        );
        // Batch 4 item 10 (owner 2026-11-02): identical content words after the
        // show-branding strip = the same story on the same show, behind ANY
        // divider, suffix OR prefix — that is 100% certain, full stop. Unknown
        // dates/durations must not cost it certainty.
        if title_sim >= 1.0 {
            return 1.0;
        }
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
        let confidence = (weighted / total).clamp(0.0, 1.0);

        // Batch 4 follow-up (owner 2026-11-02): when the two CHANNELS are
        // already linked (they share confirmed episode pairs), near-identical
        // episode titles are no longer in doubt — floor confidence at 0.95.
        // (Review 2026-11-03: the AUTO-CONFIRM bar is much higher — see
        // `certain` in best_pairing — so barely-passing titles never get
        // learned without confirmation.)
        if channels_linked && title_sim >= config.min_title_similarity {
            return confidence.max(0.95);
        }
        confidence
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
        linked: &std::collections::HashSet<(String, String)>,
    ) -> Option<BestPairing> {
        let mut best: Option<(f64, f64, bool, &YoutubeVideo)> = None; // (confidence, title_sim, certain, video)
        for video in youtube_videos {
            // Date hard gate (owner round 3): both dates known and further
            // apart than the gate → not the same episode, skip entirely.
            if let Some(gate) = config.date_hard_gate_days {
                if let Some(d) = self.date_diff(podcast.published_at, video.published_at) {
                    if d.abs() > gate {
                        continue;
                    }
                }
            }
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
            // Batch 4 item 10 follow-up: linked CHANNELS (shared confirmed
            // pairs) remove doubt from the episode titles — checked per pair.
            let channels_linked = match (podcast.channel_id.as_deref(), video.channel_id.as_deref()) {
                (Some(p), Some(v)) => {
                    linked.contains(&(p.to_string(), v.to_string()))
                        || linked.contains(&(v.to_string(), p.to_string()))
                }
                _ => false,
            };
            let confidence = self.confidence(podcast, video, config, channels_linked);
            // Auto-confirm (learn without asking) only for near-CERTAIN pairs:
            // identical-after-branding titles, or linked channels with a
            // strongly-similar title (>= 0.9, NOT the 0.7 gate) — review
            // 2026-11-03: a barely-gate-passing title on a linked channel must
            // stay a confirmation candidate.
            let certain = title_sim >= 1.0 || (channels_linked && title_sim >= 0.9 && confidence >= 0.95);
            if confidence > config.min_confidence && best.as_ref().is_none_or(|(c, _, _, _)| confidence > *c) {
                best = Some((confidence, title_sim, certain, video));
            }
        }
        best.map(|(confidence, title_similarity, certain, video)| BestPairing {
            video_id: video.id.clone(),
            confidence,
            title_similarity,
            certain,
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
    /// Certain = learned without confirmation: identical-after-branding titles
    /// (1.0), or linked channels with a title-passing pair at ≥0.95.
    pub certain: bool,
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

    /// Channel pairs that are already linked (share confirmed episode pairs) —
    /// batch 4 item 10 follow-up (owner 2026-11-02): linked channels remove
    /// doubt from episode titles. Computed once per match run.
    async fn linked_channel_pairs(&self) -> std::collections::HashSet<(String, String)> {
        // Review 2026-11-03: never swallow a DB error into "no linked channels".
        let pairs = match self.db.list_linked_channels(2).await {
            Ok(p) => p,
            Err(e) => {
                tracing::warn!("linked-channel lookup failed, continuing without the floor: {e}");
                Vec::new()
            }
        };
        pairs
            .into_iter()
            .map(|p| (p.podcast_channel_id, p.video_channel_id))
            .collect()
    }

    /// Match all unlinked podcast episodes to YouTube videos
    pub async fn match_all(&self) -> Result<MatchResult, String> {
        let unmatched_podcasts = self.db.get_unmatched_podcasts().await?;
        let youtube_videos = self.db.get_youtube_videos().await?;
        let linked = self.linked_channel_pairs().await;

        let mut matched = 0;
        let mut errors: Vec<String> = Vec::new();

        for podcast in unmatched_podcasts {
            match self.find_best_match(&podcast, &youtube_videos, &linked).await {
                Ok(Some(link)) => {
                    self.db.insert_episode_link(&link).await?;
                    matched += 1;
                }
                Ok(None) => {}
                Err(e) => errors.push(format!("{}: {}", podcast.guid, e)),
            }
        }

        // Round 3 (owner 2026-11-04): re-score UNCONFIRMED links stored under
        // older scoring — e.g. an obvious branded-suffix pair stuck at 68%
        // must become 100% and auto-confirmed on the next Run Matching.
        let config = MatchingConfig::default();
        let unconfirmed = self.db.list_unconfirmed_links().await?;
        for link in unconfirmed {
            let (Some(p), Some(v)) = (
                self.db.get_podcast_by_guid(&link.podcast_guid).await?,
                self.db.get_video_by_video_id(&link.youtube_video_id).await?,
            ) else {
                continue;
            };
            if let Some(pairing) = self.scorer.best_pairing(&p, std::slice::from_ref(&v), &config, &linked) {
                if pairing.certain || pairing.confidence > link.confidence {
                    self.db
                        .update_episode_link_scores(
                            &link.id,
                            pairing.confidence,
                            Some(pairing.title_similarity),
                            pairing.date_diff_days,
                            pairing.duration_diff_seconds,
                            pairing.certain,
                        )
                        .await?;
                }
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
        linked: &std::collections::HashSet<(String, String)>,
    ) -> Result<Option<EpisodeLink>, String> {
        let Some(pairing) = self
            .scorer
            .best_pairing(podcast, youtube_videos, &self.matching_config, linked)
        else {
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
            // Batch 2 Task 4a: a title-identical pair (after show-branding is
            // stripped) is "absolute certain" in the owner's words — LEARN it
            // (user_confirmed) instead of listing it for confirmation.
            user_confirmed: pairing.certain,
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

        // And the effect: identical titles are 1.0 now — batch 4 item 10 (owner
        // 2026-11-02): same words after the branding strip = the same story,
        // 100% certain, and absent date/duration/channel metadata must not cost
        // it. WRONG PREMISE RETIRED: this test used to pin 0.850 (the 2026-10-28
        // measurement that missing metadata diluted identical pairs); the
        // owner ruled that identical titles are certain, full stop.
        let p = pod("Why Billionaires Should Not Exist");
        let v = vid("Why Billionaires Should Not Exist");
        let confidence = sc.confidence(&p, &v, &cfg, false);
        assert!(
            (confidence - 1.0).abs() < 1e-9,
            "identical titles with no metadata must read as 1.0. Got {confidence:.3}"
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

        let confidence = sc.confidence(&p, &v, &cfg, false);
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
        let confidence = sc.confidence(&p, &v, &cfg, false);
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

    /// Live-test batch 2 Task 4a, owner's permutations: the show's own branding
    /// segment must not cost the pair its similarity, for ANY of the dividers
    /// YouTube creators actually use and in EITHER position (suffix or prefix).
    /// content_words already splits on every non-alphanumeric, so the divider
    /// itself never survives into the word list — only its placement matters.
    #[test]
    fn branded_titles_reach_1_0_for_every_divider_and_both_placements() {
        let sc = scorer();
        for divider in [" | ", " - ", " – ", " — ", ": "] {
            for branded in [
                format!("Why Billionaires Should Not Exist{divider}Some More News"),
                format!("Some More News{divider}Why Billionaires Should Not Exist"),
            ] {
                let sim = sc.title_similarity_for_pairing(
                    "Why Billionaires Should Not Exist",
                    &branded,
                    Some("Some More News"),
                    Some("Some More News"),
                );
                assert_eq!(
                    sim, 1.0,
                    "divider {divider:?}, branded title {branded:?} names the other side's channel — it is branding, not content"
                );
            }
        }
    }

    #[test]
    fn a_branded_prefix_pair_scores_near_certain() {
        let sc = scorer();
        let cfg = MatchingConfig::default();
        let mut p = pod("Why Billionaires Should Not Exist");
        p.channel_title = Some("Some More News".into());
        p.duration_seconds = Some(1600);
        let mut v = vid("Some More News — Why Billionaires Should Not Exist");
        v.channel_title = Some("Some More News".into());
        v.duration_seconds = Some(1600);

        let confidence = sc.confidence(&p, &v, &cfg, false);
        assert!(
            confidence >= 0.9,
            "a branded prefix spelling the same show must read as near-certain. Got {confidence:.3}"
        );
    }

    /// Batch 4 item 10 (owner 2026-11-02, verbatim example): the same title
    /// followed by a divider and the podcast channel name — suffix OR prefix,
    /// ANY divider — is the same story on the same show: 100% confidence.
    /// "… | The Vergecast" is the canonical shape; dash/slash/en-dash variants
    /// and the prefix form must all score the same.
    #[test]
    fn a_branded_title_with_any_divider_is_100_percent_certain() {
        let sc = scorer();
        let cfg = MatchingConfig::default();
        let mut p = pod("The touchscreen MacBook Apple said it wouldn't make");
        p.channel_title = Some("The Vergecast".into());
        p.duration_seconds = Some(3600);
        p.published_at = None; // unknown date is neutral, must not cost certainty

        for divider in [" | ", " - ", " / ", " – ", " — ", ": "] {
            for branded in [
                format!("The touchscreen MacBook Apple said it wouldn't make{divider}The Vergecast"),
                format!("The Vergecast{divider}The touchscreen MacBook Apple said it wouldn't make"),
            ] {
                let mut v = vid(&branded);
                v.channel_title = Some("The Verge".into());
                v.duration_seconds = Some(3600);
                v.published_at = None;
                let sim = sc.title_similarity_for_pairing(
                    &p.title,
                    &v.title,
                    p.channel_title.as_deref(),
                    v.channel_title.as_deref(),
                );
                assert_eq!(sim, 1.0, "branded title {branded:?} must strip to identical words");
                let confidence = sc.confidence(&p, &v, &cfg, false);
                assert!(
                    confidence >= 1.0,
                    "same title + show branding + any divider ({divider:?}) must read as 100% certain. Got {confidence:.3}"
                );
            }
        }
    }

    /// Owner live-run round 2, harder shapes: parenthesized "(Livestream)"
    /// (parens are dividers now, not just pipes) and a tag-only multi-word
    /// segment.
    #[test]
    fn parenthesized_livestream_and_tag_segments_are_1_0() {
        let sc = scorer();
        for (base, branded) in [
            (
                "How we really feel about the iPhone Duo",
                "How we really feel about the iPhone Duo (Livestream)",
            ),
            (
                "How we really feel about the iPhone Duo",
                "How we really feel about the iPhone Duo | Livestream",
            ),
        ] {
            let sim = sc.title_similarity_for_pairing(base, branded, None, None);
            assert_eq!(sim, 1.0, "pair ({base:?} vs {branded:?}) must be 1.0. Got {sim}");
        }
        // Multi-word segment that is pure tag language ("Live Replay" would
        // need all words in the tag set) plus show name WITH channel stem.
        let sim = sc.title_similarity_for_pairing(
            "The folding iPhone Duo is finally here",
            "The folding iPhone Duo is finally here | The Vergecast Livestream",
            Some("The Verge"),
            Some("The Vergecast"),
        );
        assert_eq!(sim, 1.0, "channel-stem affinity strips 'The Vergecast Livestream'. Got {sim}");
    }

    /// Owner live-run 2026-11-03, round 2: these obvious pairs must NOT ask for
    /// confirmation. (a) "… | The Vergecast" suffix; (b) "… | Livestream"
    /// suffix — livestream flag lives in the title on one side only.
    #[test]
    fn obvious_branded_and_livestream_suffixes_are_1_0() {
        let sc = scorer();
        for (base, branded, ch1, ch2) in [
            (
                "Apple's HomeView has an app problem",
                "Apple's HomeView has an app problem | The Vergecast",
                Some("The Vergecast"),
                Some("The Verge"),
            ),
            (
                "How we really feel about the iPhone Duo",
                "How we really feel about the iPhone Duo | Livestream",
                None,
                None,
            ),
        ] {
            let sim = sc.title_similarity_for_pairing(base, branded, ch1, ch2);
            assert_eq!(sim, 1.0, "pair ({base:?} vs {branded:?}) must be 1.0. Got {sim}");
        }
    }

    /// Owner 2026-11-03 (live run): "Amazon built the Trojan Horse for your
    /// smart home" vs "… | The Vergecast" must be 100% certain. Round-3
    /// refinement (owner 2026-11-04): the branding assumption must RELATE to
    /// a known channel — with channel names that share a stem ("The Verge" vs
    /// the "The Vergecast" segment) it strips; with NO channel metadata at
    /// all it must NOT ("(emotional)" is content, not branding — see the
    /// iPhone false-positive test).
    #[test]
    fn a_branded_suffix_is_1_0_via_channel_stem_affinity() {
        let sc = scorer();
        let cfg = MatchingConfig::default();
        let base = "Amazon built the Trojan Horse for your smart home";
        let branded = "Amazon built the Trojan Horse for your smart home | The Vergecast";

        // Both channel names present but DIFFERENT ("The Verge" channel holds
        // Vergecast episodes): the shared "verge" stem marks the segment as
        // show branding.
        let mut p = pod(base);
        p.channel_title = Some("The Verge".into());
        let mut v = vid(branded);
        v.channel_title = Some("The Verge".into());
        let sim = sc.title_similarity_for_pairing(&p.title, &v.title, p.channel_title.as_deref(), v.channel_title.as_deref());
        assert_eq!(sim, 1.0, "branding suffix must strip via channel-stem affinity. Got {sim}");
        assert_eq!(sc.confidence(&p, &v, &cfg, false), 1.0, "identical-after-branding is certain, full stop");

        // No channel metadata at all: NOT assumed branding (round-3 guard).
        let p2 = pod(base);
        let v2 = vid(branded);
        let sim2 = sc.title_similarity_for_pairing(&p2.title, &v2.title, None, None);
        assert!(sim2 < 1.0, "without channel metadata a suffix is content, not proven branding. Got {sim2}");
    }

    /// Owner 2026-11-04 round 3 false positive: "iPhone X Review" vs
    /// "iPhone Duo review (emotional)" are DIFFERENT phones — "(emotional)"
    /// does not relate to either channel, and word-level matching must not
    /// let "x" fuzzy-match anything. Pair must stay below the title gate.
    #[test]
    fn iphone_x_vs_iphone_duo_emotional_is_rejected() {
        let sc = scorer();
        let sim = sc.title_similarity_for_pairing(
            "iPhone X Review",
            "iPhone Duo review (emotional)",
            Some("The Verge"),
            Some("The Vergecast"),
        );
        assert!(sim < 0.7, "different phones must not pair. Got {sim}");
    }

    /// Owner 2026-11-04 round 3: the obvious branded pair is certain, and the
    /// date hard gate (+/- 2 days) rejects same-title-different-episode pairs
    /// whose publish dates are further apart.
    #[test]
    fn tesla_branded_pair_is_certain_and_date_gate_applies() {
        use chrono::{DateTime, Utc};
        let sc = scorer();
        let cfg = MatchingConfig::default();
        let mut p = pod("Why Tesla needs its cars to fly");
        p.channel_title = Some("The Vergecast".into());
        p.channel_id = Some("ch-pod".into());
        p.published_at = Some(DateTimeUtc::from(
            DateTime::parse_from_rfc3339("2026-11-01T10:00:00Z").unwrap().with_timezone(&Utc),
        ));
        let mut v = vid("Why Tesla needs its cars to fly | The Vergecast");
        v.channel_title = Some("The Verge".into());
        v.channel_id = Some("ch-vid".into());
        v.published_at = Some(DateTimeUtc::from(
            DateTime::parse_from_rfc3339("2026-11-01T12:00:00Z").unwrap().with_timezone(&Utc),
        ));

        let sim = sc.title_similarity_for_pairing(&p.title, &v.title, p.channel_title.as_deref(), v.channel_title.as_deref());
        assert_eq!(sim, 1.0, "clear pattern must be 100%%. Got {sim}");
        let empty = std::collections::HashSet::new();
        let pair = sc.best_pairing(&p, &[v.clone()], &cfg, &empty).expect("pairs");
        assert!(pair.certain && pair.confidence >= 1.0, "must be auto-certain (certain={}, conf={})", pair.certain, pair.confidence);

        // Same titles, 3 days apart → hard gate rejects.
        let mut v_far = v.clone();
        v_far.published_at = Some(DateTimeUtc::from(
            DateTime::parse_from_rfc3339("2026-11-04T10:00:00Z").unwrap().with_timezone(&Utc),
        ));
        assert!(
            sc.best_pairing(&p, std::slice::from_ref(&v_far), &cfg, &empty).is_none(),
            "3 days apart must be rejected by the date hard gate"
        );
    }

    /// Same rule for a multi-word segment that shares a stem with a known
    /// channel ("The Vergecast Special" vs channel "The Verge").
    #[test]
    fn a_branding_segment_sharing_a_channel_stem_strips() {
        let sc = scorer();
        let base = "Why your favorite creator is building an app";
        let branded = "Why your favorite creator is building an app | The Vergecast Special";
        let mut p = pod(base);
        p.channel_title = Some("The Verge".into());
        let v = vid(branded);
        let sim = sc.title_similarity_for_pairing(&p.title, &v.title, p.channel_title.as_deref(), v.channel_title.as_deref());
        assert_eq!(sim, 1.0, "segment sharing a >=4-char stem with a channel name is branding. Got {sim}");
    }

    /// Guard, suffix twin of `an_unrelated_leading_segment_still_counts`:
    /// a MULTI-word segment with no channel affinity stays content even on
    /// the pairing path — the pattern rule must not paper over a mismatch.
    #[test]
    fn an_unrelated_trailing_segment_still_counts_on_the_pairing_path() {
        let sc = scorer();
        let mut p = pod("Why Billionaires Should Not Exist");
        p.channel_title = Some("Some More News".into());
        let mut v = vid("Why Billionaires Should Not Exist | A Bonus Segment");
        v.channel_title = Some("Some More News".into());
        let sim = sc.title_similarity_for_pairing(&p.title, &v.title, p.channel_title.as_deref(), v.channel_title.as_deref());
        assert!(sim < 1.0, "an unrelated multi-word trailing segment is still extra content. Got {sim}");
    }

    /// Batch 4 follow-up (owner 2026-11-02): when the CHANNELS are already
    /// linked, near-identical episode titles lose their doubt — confidence
    /// floors at 0.95 and the pair is certain. Unlinked, the same pair is not.
    #[test]
    fn linked_channels_floor_near_identical_titles_at_0_95_and_mark_certain() {
        let sc = scorer();
        let cfg = MatchingConfig::default();
        // (words proven kept by content_words_split_on_punctuation...: apple/homeview/app)
        // 9 shared content words + 1 extra → title_sim 0.9, at the certain bar.
        let mut p = pod("apple homeview app vergecast rss feed stream queue player");
        p.channel_id = Some("ch-pod".into());
        p.channel_title = Some("The Vergecast".into());
        let mut v = vid("apple homeview app vergecast rss feed stream queue player extra"); // near-identical, below 1.0
        v.channel_id = Some("ch-vid".into());
        v.channel_title = Some("The Verge".into());

        let sim = sc.title_similarity_for_pairing(&p.title, &v.title, p.channel_title.as_deref(), v.channel_title.as_deref());
        assert!(sim >= cfg.min_title_similarity && sim < 1.0, "premise: near-identical but not exact, got {sim}");

        let unlinked = sc.confidence(&p, &v, &cfg, false);
        assert!(unlinked < 0.95, "unlinked channels must not get the floor. Got {unlinked:.3}");

        let linked = sc.confidence(&p, &v, &cfg, true);
        assert!((linked - 0.95).abs() < 1e-9, "linked channels floor near-identical titles at 0.95. Got {linked:.3}");

        // And best_pairing marks the pair certain only when linked.
        let empty = std::collections::HashSet::new();
        let mut linked_set = std::collections::HashSet::new();
        linked_set.insert(("ch-pod".to_string(), "ch-vid".to_string()));
        let pair_linked = sc.best_pairing(&p, &[v.clone()], &cfg, &linked_set).expect("pairs");
        assert!(pair_linked.certain, "linked near-identical pair must be certain");
        assert!(pair_linked.confidence >= 0.95);
        let pair_unlinked = sc.best_pairing(&p, &[v], &cfg, &empty).expect("still pairs at the gate");
        assert!(!pair_unlinked.certain, "unlinked near-identical pair is NOT certain");
    }

    /// Guard for the prefix half: only a segment spelling the OTHER side's
    /// channel is boilerplate. A different leading segment stays content, so
    /// the rule cannot paper over a genuine mismatch.
    #[test]
    fn an_unrelated_leading_segment_still_counts() {
        let sc = scorer();
        let mut p = pod("Why Billionaires Should Not Exist");
        p.channel_title = Some("Some More News".into());
        let v = vid("A Bonus Segment: Why Billionaires Should Not Exist");

        let sim = sc.title_similarity_for_pairing(
            &p.title,
            &v.title,
            p.channel_title.as_deref(),
            v.channel_title.as_deref(),
        );
        assert!(
            sim < 1.0,
            "an unrelated leading segment is still extra content, not boilerplate"
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
        let confidence = s.confidence(&podcast, &video, &config, false);
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
        let confidence = s.confidence(&podcast, &video, &config, false);
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
        let confidence = s.confidence(&podcast, &video, &config, false);
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
        let confidence = s.confidence(&podcast, &video, &config, false);
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
        let pairing = s.best_pairing(&podcast, &videos, &config, &std::collections::HashSet::new()).expect("a pairing exists");
        assert_eq!(pairing.video_id, "vid-1");
        assert!(pairing.confidence >= config.min_confidence);
        assert!(pairing.title_similarity >= config.min_title_similarity);

        // Only gated-out candidates: no pairing.
        let unrelated = vec![vid("Billionaires Are Funding 'Anti AI' Content")];
        assert!(s.best_pairing(&podcast, &unrelated, &config, &std::collections::HashSet::new()).is_none());
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

