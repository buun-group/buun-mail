//! Whether a newer Buun Mail is out: the latest published release on the project's GitHub releases page, compared
//! with this build's version. Only the release list is asked for; nothing about the person or their mail is sent.
//! Drafts and pre-releases are never offered.

use std::time::Duration;

use serde::{Deserialize, Serialize};
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

/// The fields of GitHub's release that the check reads.
#[derive(Debug, Deserialize)]
struct Release {
    tag_name: String,
    html_url: String,
    published_at: Option<String>,
}

/// Asks GitHub for the latest release. Blocking: call it off the window's thread.
///
/// # Errors
///
/// A sentence for the person when GitHub cannot be reached, answers with an error, or there is no release yet.
pub fn check() -> Result<UpdateDto, String> {
    let agent: Agent = Agent::config_builder().timeout_global(Some(Duration::from_secs(15))).http_status_as_error(false).build().new_agent();
    let mut response = agent
        .get(&format!("https://api.github.com/repos/{RELEASES_REPO}/releases/latest"))
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", &format!("Buun-Mail/{CURRENT}"))
        .call()
        .map_err(|error| format!("GitHub could not be reached: {error}"))?;
    match response.status().as_u16() {
        200 => {}
        404 => return Err("No release has been published yet.".to_owned()),
        403 | 429 => return Err("GitHub asked to wait before checking again. Try later.".to_owned()),
        status => return Err(format!("GitHub answered HTTP {status}.")),
    }
    let text = response.body_mut().read_to_string().map_err(|error| format!("GitHub's answer could not be read: {error}"))?;
    compare(&text, CURRENT)
}

/// Reads a release from GitHub's JSON and compares it with `current`.
fn compare(json: &str, current: &str) -> Result<UpdateDto, String> {
    let release: Release = serde_json::from_str(json).map_err(|error| format!("GitHub's answer could not be read: {error}"))?;
    let latest = release.tag_name.trim().trim_start_matches('v').to_owned();
    Ok(UpdateDto { newer: is_newer(&latest, current), current: current.to_owned(), latest, url: release.html_url, published_at: release.published_at })
}

/// True when `candidate` is a later `major.minor.patch` than `current`. Anything after a `-` or `+` is ignored, and a
/// version that cannot be read is never newer.
fn is_newer(candidate: &str, current: &str) -> bool {
    match (parts(candidate), parts(current)) {
        (Some(candidate), Some(current)) => candidate > current,
        _ => false,
    }
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
        assert!(!is_newer("0.5.0-beta.1", "0.5.0"), "a pre-release suffix is ignored");
        assert!(!is_newer("nightly", "0.4.0"), "an unreadable tag is never newer");
    }

    #[test]
    fn reads_the_latest_release_from_github() {
        let json = r#"{"tag_name":"v0.5.0","html_url":"https://github.com/buun-group/buun-mail/releases/tag/v0.5.0","published_at":"2026-12-01T10:00:00Z","draft":false,"assets":[]}"#;
        let found = compare(json, "0.4.0").unwrap_or_else(|error| unreachable!("{error}"));
        assert_eq!(found.latest, "0.5.0");
        assert!(found.newer);
        assert_eq!(found.url, "https://github.com/buun-group/buun-mail/releases/tag/v0.5.0");
        assert!(!compare(json, "0.5.0").is_ok_and(|same| same.newer));
        assert!(compare("{}", "0.4.0").is_err());
    }
}
