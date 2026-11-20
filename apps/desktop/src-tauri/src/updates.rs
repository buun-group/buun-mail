//! Whether a newer Buun Mail is out, and fetching its installer. Two channels: stable, the latest published release;
//! and early releases, which also takes betas (`0.6.0-beta.2`). Only the public releases pages are asked, never
//! GitHub's API, which allows just 60 unsigned requests an hour for an address many people share (a VPN's, a mobile
//! network's). Nothing about the person or their mail is sent.
//!
//! A release is offered only when its installer for this system is really attached, so a draft, a tag without a
//! release, or a build still uploading is never offered.

use std::fs::File;
use std::io;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;
use ureq::Agent;

/// The repository whose releases are checked. A fork that ships its own builds changes this one line.
pub const RELEASES_REPO: &str = "buun-group/buun-mail";

/// This build's version.
pub const CURRENT: &str = env!("CARGO_PKG_VERSION");

/// How many of the newest tags an early-release check looks at before giving up.
const CANDIDATES: usize = 6;

/// What the check found.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDto {
    /// This build's version, such as `0.5.0`.
    pub current: String,
    /// The newest release on the channel, without the `v`; the current version when nothing newer is out.
    pub latest: String,
    /// True when `latest` is newer than `current` and its installer for this system is attached.
    pub newer: bool,
    /// True when `latest` is a beta.
    pub beta: bool,
    /// The release's page, for its notes.
    pub url: String,
    /// The installer file for this system, when there is one.
    pub asset: Option<String>,
    /// True when installing replaces this copy and restarts it; false when it downloads the installer to run.
    pub in_place: bool,
}

/// An installer that was downloaded.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadedDto {
    /// Where it was saved; empty when it installed in place.
    pub path: String,
    /// True when it is run by opening it (setup, disk image, package); false for an `.AppImage`, shown in its folder.
    pub opens: bool,
    /// True when it installed in place and the app is about to restart into the new version.
    pub restarting: bool,
}

/// Whether this copy can replace itself: the Windows installer, the macOS app, and an `.AppImage`. A `.deb` or `.rpm`
/// belongs to the system's package manager, so those download the new package instead.
#[must_use]
pub fn updates_in_place() -> bool {
    cfg!(any(target_os = "windows", target_os = "macos")) || (cfg!(target_os = "linux") && std::env::var_os("APPIMAGE").is_some())
}

/// Where a release's updater manifest lives: the `latest.json` the release workflow attaches to every release.
#[must_use]
pub fn manifest_url(version: &str) -> String {
    download_url(&format!("v{version}"), "latest.json")
}

/// One version, ordered as semantic versioning orders them: a release after its own pre-releases.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Version {
    core: (u64, u64, u64),
    pre: Vec<String>,
}

impl Version {
    fn parse(text: &str) -> Option<Self> {
        let text = text.trim().trim_start_matches('v').split('+').next()?;
        let (core, pre) = text.split_once('-').unwrap_or((text, ""));
        let mut numbers = core.split('.').map(str::parse::<u64>);
        let major = numbers.next()?.ok()?;
        let minor = numbers.next()?.ok()?;
        let patch = numbers.next()?.ok()?;
        if numbers.next().is_some() {
            return None;
        }
        let pre = if pre.is_empty() { Vec::new() } else { pre.split('.').map(str::to_owned).collect() };
        Some(Self { core: (major, minor, patch), pre })
    }

    fn is_beta(&self) -> bool {
        !self.pre.is_empty()
    }
}

impl PartialOrd for Version {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Version {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        use std::cmp::Ordering;
        self.core.cmp(&other.core).then_with(|| match (self.pre.is_empty(), other.pre.is_empty()) {
            (true, true) => Ordering::Equal,
            (true, false) => Ordering::Greater,
            (false, true) => Ordering::Less,
            (false, false) => {
                for (mine, theirs) in self.pre.iter().zip(&other.pre) {
                    let order = match (mine.parse::<u64>(), theirs.parse::<u64>()) {
                        (Ok(mine), Ok(theirs)) => mine.cmp(&theirs),
                        (Ok(_), Err(_)) => Ordering::Less,
                        (Err(_), Ok(_)) => Ordering::Greater,
                        (Err(_), Err(_)) => mine.cmp(theirs),
                    };
                    if order != Ordering::Equal {
                        return order;
                    }
                }
                self.pre.len().cmp(&other.pre.len())
            }
        })
    }
}

/// True when `candidate` is a later version than `current`; an unreadable version is never newer.
#[cfg(test)]
fn is_newer(candidate: &str, current: &str) -> bool {
    matches!((Version::parse(candidate), Version::parse(current)), (Some(found), Some(running)) if found > running)
}

fn agent(follow: bool) -> Agent {
    Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(20)))
        .http_status_as_error(false)
        .max_redirects(if follow { 10 } else { 0 })
        .build()
        .new_agent()
}

fn user_agent() -> String {
    format!("Buun-Mail/{CURRENT}")
}

/// Asks GitHub for the newest release on the channel whose installer for this system is attached. Blocking: call it
/// off the window's thread.
///
/// # Errors
///
/// A sentence for the person when GitHub cannot be reached or answers with an error.
pub fn check(early: bool) -> Result<UpdateDto, String> {
    let tags = if early { feed_tags()? } else { latest_tag()?.into_iter().collect() };
    let current = Version::parse(CURRENT);
    let mut candidates: Vec<(Version, String)> =
        tags.into_iter().filter_map(|tag| Version::parse(&tag).map(|version| (version, tag))).filter(|(version, _)| early || !version.is_beta()).collect();
    candidates.sort_by(|a, b| b.0.cmp(&a.0));
    for (version, tag) in candidates.into_iter().take(CANDIDATES) {
        if current.as_ref().is_some_and(|current| &version <= current) {
            break;
        }
        let latest = tag.trim_start_matches('v').to_owned();
        let Some(asset) = asset_name(&latest, version.is_beta()) else { break };
        if attached(&tag, &asset)? {
            return Ok(UpdateDto {
                current: CURRENT.to_owned(),
                latest,
                newer: true,
                beta: version.is_beta(),
                url: release_page(&tag),
                asset: Some(asset),
                in_place: updates_in_place(),
            });
        }
    }
    Ok(UpdateDto {
        current: CURRENT.to_owned(),
        latest: CURRENT.to_owned(),
        newer: false,
        beta: false,
        url: format!("https://github.com/{RELEASES_REPO}/releases"),
        asset: None,
        in_place: updates_in_place(),
    })
}

/// The latest stable release's tag, from where `/releases/latest` redirects (`/releases/tag/v0.5.0`).
fn latest_tag() -> Result<Option<String>, String> {
    let response = agent(false)
        .get(&format!("https://github.com/{RELEASES_REPO}/releases/latest"))
        .header("User-Agent", &user_agent())
        .call()
        .map_err(|error| format!("GitHub could not be reached: {error}"))?;
    let status = response.status().as_u16();
    if status == 404 {
        return Ok(None);
    }
    if !(300..400).contains(&status) {
        return Err(format!("GitHub answered HTTP {status}."));
    }
    let location = response.headers().get("location").and_then(|value| value.to_str().ok()).unwrap_or_default();
    Ok(tags_in(location).into_iter().next())
}

/// Every tag in the public releases feed, betas included.
fn feed_tags() -> Result<Vec<String>, String> {
    let mut response = agent(true)
        .get(&format!("https://github.com/{RELEASES_REPO}/releases.atom"))
        .header("User-Agent", &user_agent())
        .call()
        .map_err(|error| format!("GitHub could not be reached: {error}"))?;
    let status = response.status().as_u16();
    if status != 200 {
        return Err(format!("GitHub answered HTTP {status}."));
    }
    let text = response.body_mut().read_to_string().map_err(|error| format!("GitHub's answer could not be read: {error}"))?;
    Ok(tags_in(&text))
}

/// The tags named by `/releases/tag/<tag>` links in some text, in order, once each.
fn tags_in(text: &str) -> Vec<String> {
    let mut tags: Vec<String> = Vec::new();
    for piece in text.split("/releases/tag/").skip(1) {
        let tag: String = piece.chars().take_while(|character| character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '+' | '_')).collect();
        if !tag.is_empty() && !tags.contains(&tag) {
            tags.push(tag);
        }
    }
    tags
}

fn release_page(tag: &str) -> String {
    format!("https://github.com/{RELEASES_REPO}/releases/tag/{tag}")
}

fn download_url(tag: &str, asset: &str) -> String {
    format!("https://github.com/{RELEASES_REPO}/releases/download/{tag}/{asset}")
}

/// True when the release has this file attached: GitHub redirects a download it has and answers 404 otherwise.
fn attached(tag: &str, asset: &str) -> Result<bool, String> {
    let response = agent(false)
        .head(&download_url(tag, asset))
        .header("User-Agent", &user_agent())
        .call()
        .map_err(|error| format!("GitHub could not be reached: {error}"))?;
    Ok(matches!(response.status().as_u16(), 200 | 301 | 302 | 303 | 307 | 308))
}

/// The installer a release carries for this system, named as the release workflow uploads it. Linux takes the kind it
/// was installed as: an `.AppImage` when running from one, else a `.deb` on Debian and Ubuntu, an `.rpm` on Fedora and
/// `openSUSE` (stable only: a beta has no `.rpm`), and an `.AppImage` anywhere else.
fn asset_name(version: &str, beta: bool) -> Option<String> {
    if cfg!(target_os = "windows") {
        cfg!(target_arch = "x86_64").then(|| format!("Buun.Mail_{version}_x64-setup.exe"))
    } else if cfg!(target_os = "macos") {
        Some(format!("Buun.Mail_{version}_{}.dmg", if cfg!(target_arch = "aarch64") { "aarch64" } else { "x64" }))
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        let appimage = format!("Buun.Mail_{version}_amd64.AppImage");
        if std::env::var_os("APPIMAGE").is_some() {
            Some(appimage)
        } else if Path::new("/etc/debian_version").exists() {
            Some(format!("Buun.Mail_{version}_amd64.deb"))
        } else if !beta && (Path::new("/etc/fedora-release").exists() || Path::new("/etc/redhat-release").exists() || Path::new("/etc/SUSE-brand").exists()) {
            Some(format!("Buun.Mail-{version}-1.x86_64.rpm"))
        } else {
            Some(appimage)
        }
    } else {
        None
    }
}

/// Downloads a release's installer for this system into `folder`. Returns where it was saved, and true when opening it
/// runs it (false for an `.AppImage`, which is shown in its folder). Blocking: call it off the window's thread.
///
/// # Errors
///
/// A sentence for the person when the version has no installer here, or the download or the file fails.
pub fn download(version: &str, folder: &Path) -> Result<(PathBuf, bool), String> {
    let parsed = Version::parse(version).ok_or_else(|| format!("`{version}` is not a version."))?;
    let asset = asset_name(version, parsed.is_beta()).ok_or_else(|| "Buun Mail has no installer for this system.".to_owned())?;
    let mut response = agent(true)
        .get(&download_url(&format!("v{version}"), &asset))
        .header("User-Agent", &user_agent())
        .call()
        .map_err(|error| format!("The download could not start: {error}"))?;
    let status = response.status().as_u16();
    if status != 200 {
        return Err(format!("GitHub answered HTTP {status} for {asset}."));
    }
    std::fs::create_dir_all(folder).map_err(|error| format!("{}: {error}", folder.display()))?;
    let path = folder.join(&asset);
    let partial = folder.join(format!("{asset}.part"));
    let written = (|| -> io::Result<()> {
        let mut file = File::create(&partial)?;
        io::copy(&mut response.body_mut().with_config().limit(1_000_000_000).reader(), &mut file)?;
        file.sync_all()?;
        std::fs::rename(&partial, &path)
    })();
    if let Err(error) = written {
        let _ = std::fs::remove_file(&partial);
        return Err(format!("The download did not finish: {error}"));
    }
    let appimage = Path::new(&asset).extension().is_some_and(|extension| extension.eq_ignore_ascii_case("appimage"));
    #[cfg(unix)]
    if appimage {
        use std::os::unix::fs::PermissionsExt as _;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).map_err(|error| format!("{}: {error}", path.display()))?;
    }
    Ok((path, !appimage))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn orders_versions_with_betas_before_their_release() {
        assert!(is_newer("0.10.0", "0.9.9"));
        assert!(is_newer("1.0.0", "0.42.7"));
        assert!(!is_newer("0.4.0", "0.4.0"));
        assert!(!is_newer("0.3.9", "0.4.0"));
        assert!(is_newer("0.6.0-beta.1", "0.5.0"), "a beta of the next version is newer than the last release");
        assert!(!is_newer("0.5.0-beta.1", "0.5.0"), "a beta is never offered over its own release");
        assert!(is_newer("0.6.0", "0.6.0-beta.2"), "the release follows its betas");
        assert!(is_newer("0.6.0-beta.10", "0.6.0-beta.9"), "beta numbers count as numbers");
        assert!(!is_newer("nightly", "0.4.0"), "an unreadable tag is never newer");
    }

    #[test]
    fn reads_tags_from_a_redirect_and_from_the_feed() {
        assert_eq!(tags_in("https://github.com/buun-group/buun-mail/releases/tag/v0.5.0"), ["v0.5.0"]);
        let feed = r#"<entry><link rel="alternate" type="text/html" href="https://github.com/buun-group/buun-mail/releases/tag/v0.6.0-beta.2"/></entry>
            <entry><link href="https://github.com/buun-group/buun-mail/releases/tag/v0.5.0"/><id>tag:github.com,2008:Repository/1/v0.5.0</id></entry>"#;
        assert_eq!(tags_in(feed), ["v0.6.0-beta.2", "v0.5.0"]);
        assert_eq!(tags_in("https://github.com/buun-group/buun-mail/releases"), Vec::<String>::new());
    }

    #[test]
    fn names_the_installer_the_release_workflow_uploads() {
        let name = asset_name("0.6.0", false).unwrap_or_default();
        assert!(name.starts_with("Buun.Mail"), "{name}");
        assert!(name.contains("0.6.0"), "{name}");
    }

    #[test]
    #[ignore = "reaches github.com; run with --ignored"]
    fn asks_github_for_real() {
        let stable = check(false).unwrap_or_else(|error| unreachable!("{error}"));
        let early = check(true).unwrap_or_else(|error| unreachable!("{error}"));
        assert!(!stable.beta, "{stable:?}");
        assert!(early.newer || !stable.newer, "the early channel sees at least what stable sees: {stable:?} {early:?}");
    }
}
