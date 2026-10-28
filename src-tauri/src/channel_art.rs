//! Live-test Task 10 (part 2b): video-channel avatars.
//!
//! "also I'd like the channels liste there to be clickable to I can explore
//! them and the should have small profile pictures" — the podcast half landed
//! via the feed's `<itunes:image>` (Task 9 + the Task 10a refresh backfill).
//! Video channels have no feed, so their art comes from Invidious's
//! `/api/v1/channels/{ucid}` `authorThumbnails`.
//!
//! This module holds the pure parts: the thumbnail shape and the picker. The
//! picker is pure and unit-tested, because "which of these five entries do we
//! show, and at what cost" is a decision worth pinning independently of the
//! network call that produces the list.

use serde::Deserialize;

/// One entry of Invidious's `authorThumbnails`.
///
/// Only `width` is kept: the published shape also carries `height`, but no
/// decision here uses it (the requirement is a width floor), and an unused field
/// is a dead-code warning that breaks the zero-warnings gate. serde ignores
/// unknown fields, so real responses — which do include `height` — still parse.
#[derive(Debug, Clone, Deserialize)]
pub struct AuthorThumbnail {
    pub url: String,
    #[serde(default)]
    pub width: Option<u32>,
}

/// The smallest avatar tier we consider acceptable. 48px (a common Invidious
/// tier) looks soft at the 40px the Channels row renders; 176 is plenty and
/// already on the CDN, so there is no reason to ask for more.
pub const MIN_AUTHOR_THUMBNAIL_WIDTH: u32 = 88;

/// Pick the avatar to show from Invidious's `authorThumbnails`.
///
/// Order: the SMALLEST entry that meets `min_width`. Invidious returns the
/// array ascending, so taking the first qualifying entry is the least bandwidth
/// for a sufficient image — asking for a 1024px master to fill a 40px circle is
/// waste. If nothing meets the minimum (an instance that only offers 48px), the
/// largest available is used: a soft avatar beats the generic placeholder, and
/// the caller asked for art.
///
/// Entries without a width cannot be compared, so they are never chosen — an
/// unusable entry would otherwise silently become the answer.
pub fn pick_author_thumbnail<'a>(
    thumbnails: &'a [AuthorThumbnail],
    min_width: u32,
) -> Option<&'a AuthorThumbnail> {
    let mut smallest_qualifying: Option<&'a AuthorThumbnail> = None;
    let mut largest: Option<&'a AuthorThumbnail> = None;
    for t in thumbnails {
        // An entry without a width cannot be compared against the minimum, so
        // it is never eligible — not even as the fallback.
        let Some(width) = t.width else { continue };
        if smallest_qualifying.is_none() && width >= min_width {
            smallest_qualifying = Some(t);
        }
        if largest.is_none_or(|best| width > best.width.unwrap_or(0)) {
            largest = Some(t);
        }
    }
    smallest_qualifying.or(largest)
}

/// The subset of Invidious's `/api/v1/channels/{id}` response this needs. Every
/// field is optional/defaulted: instances differ in what they publish, and a
/// channel with no art at all is a normal answer, not a parse failure.
#[derive(Debug, Deserialize)]
struct ChannelResponse {
    #[serde(default)]
    author_thumbnails: Vec<AuthorThumbnail>,
}

/// Fetch a video channel's avatar from one Invidious instance.
///
/// Returns the chosen URL, or None on ANY failure — a non-200, a timeout, a
/// malformed body, an instance that publishes nothing. The caller is a list of
/// rows and a refresh loop, neither of which has anything useful to do with the
/// reason, and a missing avatar must never surface as an error toast.
pub async fn fetch_author_thumbnail(
    client: &reqwest::Client,
    base_url: &str,
    author_id: &str,
    timeout: std::time::Duration,
) -> Option<String> {
    let url = format!(
        "{}/api/v1/channels/{}",
        base_url.trim_end_matches('/'),
        author_id
    );
    let response = tokio::time::timeout(timeout, client.get(&url).send())
        .await
        .ok()?
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let body = response.text().await.ok()?;
    let channel: ChannelResponse = serde_json::from_str(&body).ok()?;
    pick_author_thumbnail(&channel.author_thumbnails, MIN_AUTHOR_THUMBNAIL_WIDTH)
        .map(|t| t.url.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn thumb(url: &str, width: Option<u32>) -> AuthorThumbnail {
        AuthorThumbnail { url: url.to_string(), width }
    }

    /// The real shape, from Invidious: ascending tiers, width and height.
    #[test]
    fn parses_the_real_author_thumbnails_shape() {
        let json = r#"[
          {"url": "https://yt4.ggpht.com/a.jpg?width=48", "width": 48, "height": 48},
          {"url": "https://yt4.ggpht.com/a.jpg?width=176", "width": 176, "height": 176},
          {"url": "https://yt4.ggpht.com/a.jpg?width=1024", "width": 1024, "height": 1024}
        ]"#;
        let parsed: Vec<AuthorThumbnail> = serde_json::from_str(json).expect("parse thumbnails");
        assert_eq!(parsed.len(), 3);
        assert_eq!(parsed[1].width, Some(176));
    }

    #[test]
    fn picks_the_smallest_tier_that_meets_the_minimum() {
        // The point of the picker: 176 is enough, so the 1024 master is not
        // fetched and put in the row.
        let tiers = [
            thumb("48", Some(48)),
            thumb("176", Some(176)),
            thumb("1024", Some(1024)),
        ];
        let picked = pick_author_thumbnail(&tiers, MIN_AUTHOR_THUMBNAIL_WIDTH)
            .expect("a tier is chosen");
        assert_eq!(picked.url, "176");
        assert_eq!(picked.width, Some(176));
    }

    #[test]
    fn falls_back_to_the_largest_when_nothing_meets_the_minimum() {
        // An instance that only publishes 48px: art still beats a placeholder.
        let tiers = [thumb("24", Some(24)), thumb("48", Some(48))];
        let picked = pick_author_thumbnail(&tiers, MIN_AUTHOR_THUMBNAIL_WIDTH)
            .expect("some art is chosen");
        assert_eq!(picked.url, "48", "the largest available is used");
    }

    #[test]
    fn an_exactly_at_the_minimum_tier_qualifies() {
        let tiers = [thumb("88", Some(88)), thumb("176", Some(176))];
        let picked = pick_author_thumbnail(&tiers, 88).expect("chosen");
        assert_eq!(picked.url, "88", ">= the minimum, not > it");
    }

    #[test]
    fn entries_without_a_width_are_never_chosen() {
        // An unusable entry must not silently become the answer.
        let tiers = [thumb("unknown", None), thumb("176", Some(176))];
        let picked = pick_author_thumbnail(&tiers, MIN_AUTHOR_THUMBNAIL_WIDTH)
            .expect("the known-width entry is chosen");
        assert_eq!(picked.url, "176");
    }

    #[test]
    fn no_usable_entry_yields_none() {
        assert!(pick_author_thumbnail(&[], 88).is_none());
        assert!(pick_author_thumbnail(&[thumb("unknown", None)], 88).is_none());
    }
}
