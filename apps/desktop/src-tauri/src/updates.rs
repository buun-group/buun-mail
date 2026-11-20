//! Whether a newer Buun Mail is out: the latest published release on the project's GitHub releases page, compared
//! with this build's version. Only the public releases page is asked; nothing about the person or their mail is sent.
//! Drafts and pre-releases are never offered.

use std::time::Duration;

use serde::Serialize;
use ureq::Agent;

/// The repository whose releases are checked. A fork that ships its own builds changes this one line.
pub const RELEASES_REPO: &str = "buun-group/buun-mail";

/// This build's version.
pub const CURRENT: &str = env!("CARGO_PKG_VERSION");

/// What the check found.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDto {
    /// This build's version, such as `0.4.0`.
    pub current: String,
    /// The newest published release's version, without the `v`.
    pub latest: String,
    /// True when `latest` is newer than `current`.
    pub newer: bool,
    /// The release's page, to download it from.
    pub url: String,
    /// When it was published, RFC 3339.
    pub published_at: Option<String>,
}

/// Asks GitHub for the latest release. Blocking: call it off the window's thread.
///
/// It reads where the public releases page sends `/releases/latest` (to `/releases/tag/v0.5.0`) rather than calling
/// GitHub's API, which allows only 60 unsigned requests an hour for an address that many people can share, such as a
/// VPN's or a mobile network's.
///
/// # Errors
///
/// A sentence for the person when GitHub cannot be reached, answers with an error, or there is no release yet.
pub fn check() -> Result<UpdateDto, String> {
    let agent: Agent = Agent::config_builder().timeout_global(Some(Duration::from_secs(15))).http_status_as_error(false).max_redirects(0).build().new_agent();
    let response = agent
        .get(&format!("https://github.com/{RELEASES_REPO}/releases/latest"))
        .header("User-Agent", &format!("Buun-Mail/{CURRENT}"))
        .call()
        .map_err(|error| format!("GitHub could not be reached: {error}"))?;
    let status = response.status().as_u16();
    if !(300..400).contains(&status) {
        return Err(if status == 404 { "No release has been published yet.".to_owned() } else { format!("GitHub answered HTTP {status}.") });
    }
    let location = response.headers().get("location").and_then(|value| value.to_str().ok()).unwrap_or_default();
    compare(location, CURRENT)
}

/// Reads the release's tag from where `/releases/latest` sends the browser, and compares it with `current`.
fn compare(location: &str, current: &str) -> Result<UpdateDto, String> {
    let tag = location.split_once("/releases/tag/").map(|(_, tag)| tag.trim_end_matches('/')).filter(|tag| !tag.is_empty());
    let Some(tag) = tag else {
        return Err("No release has been published yet.".to_owned());
    };
    let latest = tag.trim_start_matches('v').to_owned();
    let url = if location.starts_with("https://") { location.to_owned() } else { format!("https://github.com{location}") };
    Ok(UpdateDto { newer: is_newer(&latest, current), current: current.to_owned(), latest, url, published_at: None })
}

/// True when `candidate` is a later `major.minor.patch` than `current`, or the same one released after `current` was a
/// beta of it (`0.6.0` after `0.6.0-beta.2`). Build metadata after `+` is ignored, and a version that cannot be read is
/// never newer.
fn is_newer(candidate: &str, current: &str) -> bool {
    match (parts(candidate), parts(current)) {
        (Some(found), Some(running)) => found > running || (found == running && is_beta(current) && !is_beta(candidate)),
        _ => false,
    }
}

fn is_beta(version: &str) -> bool {
    version.split('+').next().is_some_and(|core| core.contains('-'))
}

fn parts(version: &str) -> Option<(u64, u64, u64)> {
    let core = version.split(['-', '+']).next()?;
    let mut numbers = core.split('.').map(str::parse::<u64>);
    let major = numbers.next()?.ok()?;
    let minor = numbers.next().unwrap_or(Ok(0)).ok()?;
    let patch = numbers.next().unwrap_or(Ok(0)).ok()?;
    Some((major, minor, patch))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_versions_by_number_not_by_text() {
        assert!(is_newer("0.10.0", "0.9.9"));
        assert!(is_newer("1.0.0", "0.42.7"));
        assert!(is_newer("0.4.1", "0.4.0"));
        assert!(!is_newer("0.4.0", "0.4.0"));
        assert!(!is_newer("0.3.9", "0.4.0"));
        assert!(!is_newer("0.5.0-beta.1", "0.5.0"), "a beta is never offered over its stable version");
        assert!(is_newer("0.6.0", "0.6.0-beta.2"), "a beta tester is told when the stable version ships");
        assert!(!is_newer("0.6.0-beta.3", "0.6.0-beta.2"), "betas are not offered through this check");
        assert!(!is_newer("nightly", "0.4.0"), "an unreadable tag is never newer");
    }

    #[test]
    fn reads_the_latest_release_from_where_the_page_redirects() {
        let found = compare("https://github.com/buun-group/buun-mail/releases/tag/v0.5.0", "0.4.0").unwrap_or_else(|error| unreachable!("{error}"));
        assert_eq!((found.latest.as_str(), found.newer), ("0.5.0", true));
        assert_eq!(found.url, "https://github.com/buun-group/buun-mail/releases/tag/v0.5.0");
        assert!(compare("/buun-group/buun-mail/releases/tag/v0.5.0", "0.5.0").is_ok_and(|same| !same.newer && same.url.starts_with("https://github.com/")));
        assert!(compare("https://github.com/buun-group/buun-mail/releases", "0.4.0").is_err(), "no release yet");
    }

    #[test]
    #[ignore = "reaches github.com; run with --ignored"]
    fn asks_github_for_real() {
        let found = check().unwrap_or_else(|error| unreachable!("{error}"));
        assert!(found.url.contains("/releases/tag/v"), "{found:?}");
    }
}
