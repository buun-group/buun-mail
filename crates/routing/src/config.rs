//! The routing file as written by a person: TOML, read once, checked whole.

use serde::Deserialize;

/// The whole routing file.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    /// Every workspace, in the order the sidebar shows them.
    #[serde(rename = "workspace", default)]
    pub workspaces: Vec<WorkspaceConfig>,
}

/// One workspace: usually one business, sometimes one side of life.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkspaceConfig {
    /// A short stable id, such as `acme`. Stored with every message, so never renamed.
    pub id: String,
    /// The name the sidebar shows.
    pub name: String,
    /// The addresses this workspace owns: `sales@acme.com` or `*@acme.com`.
    #[serde(rename = "match")]
    pub patterns: Vec<String>,
    /// Folders inside the workspace, picked by who the message is from. First match wins.
    #[serde(default)]
    pub folders: Vec<FolderRule>,
}

/// A folder and the senders that land in it.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FolderRule {
    /// The folder's name, such as `Receipts`.
    pub name: String,
    /// The sender pattern: `billing@stripe.com` or `*@stripe.com`.
    pub from: String,
}
