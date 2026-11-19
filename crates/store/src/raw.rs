//! Raw messages on disk: `raw/ab/abcdef....eml`, sharded by the first two characters of the id so no folder grows huge.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// The file extension every raw message is stored with.
const EXTENSION: &str = "eml";

/// How many leading characters of the id name the shard folder.
const SHARD: usize = 2;

/// The folder raw messages live in.
#[derive(Debug, Clone)]
pub(crate) struct RawFiles {
    root: PathBuf,
}

impl RawFiles {
    pub(crate) fn new(root: PathBuf) -> Self {
        Self { root }
    }

    /// Where a message's bytes live.
    pub(crate) fn path(&self, id: &str) -> PathBuf {
        let shard = id.get(..SHARD).unwrap_or(id);
        self.root.join(shard).join(format!("{id}.{EXTENSION}"))
    }

    /// Writes a message's bytes through a temporary file and a rename, so a crash never leaves half a message.
    pub(crate) fn write(&self, id: &str, bytes: &[u8]) -> io::Result<()> {
        let path = self.path(id);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let partial = path.with_extension("partial");
        fs::write(&partial, bytes)?;
        fs::rename(&partial, &path)
    }

    pub(crate) fn read(&self, id: &str) -> io::Result<Vec<u8>> {
        fs::read(self.path(id))
    }

    pub(crate) fn root(&self) -> &Path {
        &self.root
    }
}
