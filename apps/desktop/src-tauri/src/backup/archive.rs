//! What a backup holds and how it goes back: every file of the config folder (`config/`) and of the store (`store/`),
//! each a path and its bytes, inside the sealed stream.

use std::fs::{self, File};
use std::io::{self, BufReader, BufWriter, Read, Write};
use std::path::{Component, Path, PathBuf};

use super::seal::{Opener, Sealer};

/// Where the app keeps what a backup holds.
#[derive(Debug, Clone)]
pub struct BackupPaths {
    /// The config folder: settings, the routing file, the install's key.
    pub config: PathBuf,
    /// The store folder: the index and every message.
    pub store: PathBuf,
}

impl BackupPaths {
    /// Where a restore waits for the next start.
    fn pending(&self) -> PathBuf {
        self.store.parent().unwrap_or(&self.store).join("restore-pending")
    }
}

/// Every file under `root`, as paths relative to it, with `/` between parts. Unfinished writes are left out.
fn files_under(root: &Path) -> io::Result<Vec<String>> {
    let mut found = Vec::new();
    let mut folders = vec![root.to_path_buf()];
    while let Some(folder) = folders.pop() {
        let Ok(entries) = fs::read_dir(&folder) else { continue };
        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            if entry.file_type()?.is_dir() {
                folders.push(path);
            } else if path.extension().is_none_or(|extension| extension != "partial") {
                let relative = path.strip_prefix(root).map_err(|error| io::Error::other(error.to_string()))?;
                found.push(relative.components().map(|part| part.as_os_str().to_string_lossy().into_owned()).collect::<Vec<_>>().join("/"));
            }
        }
    }
    found.sort();
    Ok(found)
}

/// Writes a backup of `paths` to `to`, sealed with `passphrase`. The caller keeps the store still meanwhile. Returns
/// how many files went in.
///
/// # Errors
///
/// When a file cannot be read or the backup cannot be written.
pub fn create(paths: &BackupPaths, to: &Path, passphrase: &str) -> io::Result<usize> {
    let partial = to.with_extension("partial");
    let mut sealer = Sealer::new(BufWriter::new(File::create(&partial)?), passphrase)?;
    let mut count = 0;
    for (prefix, root) in [("config", &paths.config), ("store", &paths.store)] {
        for relative in files_under(root)? {
            let name = format!("{prefix}/{relative}");
            let mut file = File::open(root.join(&relative))?;
            let size = file.metadata()?.len();
            sealer.write_all(b"F")?;
            sealer.write_all(&u16::try_from(name.len()).map_err(|_| io::Error::other("path too long"))?.to_le_bytes())?;
            sealer.write_all(name.as_bytes())?;
            sealer.write_all(&size.to_le_bytes())?;
            let copied = io::copy(&mut (&mut file).take(size), &mut sealer)?;
            if copied != size {
                return Err(io::Error::other(format!("{name} changed while it was copied")));
            }
            count += 1;
        }
    }
    sealer.write_all(b"E")?;
    sealer.finish()?.into_inner().map_err(|error| io::Error::other(error.to_string()))?.sync_all()?;
    fs::rename(&partial, to)?;
    Ok(count)
}

/// A backup path made safe to write under the staging folder: only plain names, under `config/` or `store/`.
fn safe_path(name: &str) -> Option<PathBuf> {
    let path = Path::new(name);
    let mut parts = path.components();
    let first = parts.next()?;
    if !matches!(first, Component::Normal(part) if part == "config" || part == "store") {
        return None;
    }
    path.components().all(|part| matches!(part, Component::Normal(_))).then(|| path.to_path_buf())
}

/// Checks and unpacks a backup beside the current data, to be swapped in at the next start. Returns how many files.
///
/// # Errors
///
/// A wrong passphrase, a damaged or edited file, or a staging folder that cannot be written. Nothing is left staged then.
pub fn stage_restore(paths: &BackupPaths, from: &Path, passphrase: &str) -> io::Result<usize> {
    let staging = paths.pending();
    let _ = fs::remove_dir_all(&staging);
    let unpacked = unpack(&staging, from, passphrase);
    if unpacked.is_err() {
        let _ = fs::remove_dir_all(&staging);
    }
    unpacked
}

fn unpack(staging: &Path, from: &Path, passphrase: &str) -> io::Result<usize> {
    let mut opener = Opener::new(BufReader::new(File::open(from)?), passphrase)?;
    let mut count = 0;
    loop {
        let mut kind = [0_u8; 1];
        opener.read_exact(&mut kind)?;
        match &kind {
            b"E" => break,
            b"F" => {}
            _ => return Err(io::Error::other("The backup is damaged.")),
        }
        let mut length = [0_u8; 2];
        opener.read_exact(&mut length)?;
        let mut name = vec![0_u8; usize::from(u16::from_le_bytes(length))];
        opener.read_exact(&mut name)?;
        let name = String::from_utf8(name).map_err(|_| io::Error::other("The backup is damaged."))?;
        let relative = safe_path(&name).ok_or_else(|| io::Error::other("The backup names a file outside the mailbox."))?;
        let mut size = [0_u8; 8];
        opener.read_exact(&mut size)?;
        let size = u64::from_le_bytes(size);
        let target = staging.join(relative);
        if let Some(folder) = target.parent() {
            fs::create_dir_all(folder)?;
        }
        let mut out = File::create(&target)?;
        let copied = io::copy(&mut (&mut opener).take(size), &mut out)?;
        if copied != size {
            return Err(io::Error::other("The backup is cut short."));
        }
        count += 1;
    }
    // The whole stream must have been read and checked, its last chunk included.
    let mut rest = [0_u8; 1];
    if opener.read(&mut rest)? != 0 {
        return Err(io::Error::other("The backup is damaged."));
    }
    File::create(staging.join("READY"))?;
    Ok(count)
}

/// At start, before anything opens: swaps a staged restore in, keeping the data it replaces in `before-restore-<time>`.
/// Returns true when it restored.
///
/// # Errors
///
/// When the folders cannot be moved; the staged restore then waits for the next start.
pub fn apply_pending(paths: &BackupPaths, now: i64) -> io::Result<bool> {
    let staging = paths.pending();
    if !staging.join("READY").exists() {
        return Ok(false);
    }
    let kept = staging.parent().unwrap_or(&staging).join(format!("before-restore-{now}"));
    fs::create_dir_all(&kept)?;
    for (name, live) in [("config", &paths.config), ("store", &paths.store)] {
        if live.exists() {
            fs::rename(live, kept.join(name))?;
        }
        let staged = staging.join(name);
        if staged.exists() {
            if let Some(parent) = live.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::rename(&staged, live)?;
        }
    }
    fs::remove_dir_all(&staging)?;
    Ok(true)
}
