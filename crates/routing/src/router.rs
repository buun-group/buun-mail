//! The router: a checked routing file, ready to place messages.

use std::collections::{HashMap, HashSet};

use crate::address::Address;
use crate::config::{Config, WorkspaceConfig};
use crate::error::{AddressError, ConfigError};
use crate::pattern::Pattern;

/// The workspace that holds mail no rule claims, so nothing is ever dropped.
pub const UNSORTED_WORKSPACE: &str = "unsorted";

/// The name the unsorted workspace shows.
pub const UNSORTED_NAME: &str = "Unsorted";

/// A workspace's stable id.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct WorkspaceId(String);

impl WorkspaceId {
    /// The id as text.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// A folder's name inside a workspace.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct FolderName(String);

impl FolderName {
    /// The name as text.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// The two addresses routing reads: who sent a message and who it was delivered to.
///
/// `to` is the envelope recipient (`RCPT TO`), never the `To:` header: a header can name a list or anyone at all, the
/// envelope names the address that actually received the message.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Envelope {
    /// The sender.
    pub from: Address,
    /// The recipient that received it.
    pub to: Address,
}

impl Envelope {
    /// Reads both addresses.
    ///
    /// # Errors
    ///
    /// [`AddressError`] when either is not an address.
    pub fn parse(from: &str, to: &str) -> Result<Self, AddressError> {
        Ok(Self { from: Address::parse(from)?, to: Address::parse(to)? })
    }
}

/// Where one message goes, and the rules that sent it there, so the UI can say why.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Route<'r> {
    /// The workspace, [`UNSORTED_WORKSPACE`] when no rule claims the recipient.
    pub workspace: &'r WorkspaceId,
    /// The folder, or `None` for the workspace's inbox.
    pub folder: Option<&'r FolderName>,
    /// The recipient pattern that picked the workspace, `None` for unsorted mail.
    pub matched: Option<&'r Pattern>,
    /// The sender pattern that picked the folder, `None` for the inbox.
    pub folder_matched: Option<&'r Pattern>,
}

/// One workspace after checking.
#[derive(Debug, Clone)]
pub struct Workspace {
    id: WorkspaceId,
    name: String,
    icon: Option<String>,
    patterns: Vec<Pattern>,
    folders: Vec<(Pattern, FolderName)>,
    folder_icons: HashMap<FolderName, String>,
}

impl Workspace {
    /// The stable id.
    #[must_use]
    pub const fn id(&self) -> &WorkspaceId {
        &self.id
    }

    /// The name the sidebar shows.
    #[must_use]
    pub fn name(&self) -> &str {
        &self.name
    }

    /// The glyph key from the routing file, if any.
    #[must_use]
    pub fn icon(&self) -> Option<&str> {
        self.icon.as_deref()
    }

    /// The glyph key for one of its folders, if the routing file gave one.
    #[must_use]
    pub fn folder_icon(&self, folder: &FolderName) -> Option<&str> {
        self.folder_icons.get(folder).map(String::as_str)
    }

    /// The addresses the workspace owns.
    #[must_use]
    pub fn patterns(&self) -> &[Pattern] {
        &self.patterns
    }

    /// Each folder's name, in rule order, without repeats: two rules may fill one folder.
    pub fn folders(&self) -> impl Iterator<Item = &FolderName> {
        let mut seen = HashSet::new();
        self.folders.iter().map(|(_, name)| name).filter(move |name| seen.insert(*name))
    }
}

/// A checked routing file. Build one with [`Router::from_toml`] or [`Router::from_config`].
#[derive(Debug, Clone)]
pub struct Router {
    workspaces: Vec<Workspace>,
    unsorted: Workspace,
}

impl Router {
    /// Reads and checks a routing file.
    ///
    /// # Errors
    ///
    /// [`ConfigError`] when the TOML is malformed or any rule is invalid. See [`Router::from_config`].
    pub fn from_toml(source: &str) -> Result<Self, ConfigError> {
        Self::from_config(toml::from_str(source)?)
    }

    /// Checks a parsed routing file.
    ///
    /// # Errors
    ///
    /// [`ConfigError`] for an empty id or name, a reused or reserved id, an unreadable pattern, or a pattern two
    /// workspaces both claim.
    pub fn from_config(config: Config) -> Result<Self, ConfigError> {
        let mut ids = HashSet::new();
        let mut owners: HashMap<Pattern, String> = HashMap::new();
        let mut workspaces = Vec::with_capacity(config.workspaces.len());

        for workspace in config.workspaces {
            check_identity(&workspace, &mut ids)?;
            let checked = check_workspace(workspace)?;
            for pattern in &checked.patterns {
                if let Some(first) = owners.insert(pattern.clone(), checked.id.0.clone()) {
                    return Err(ConfigError::DuplicatePattern { pattern: pattern.to_string(), first, second: checked.id.0 });
                }
            }
            workspaces.push(checked);
        }

        let unsorted = Workspace {
            id: WorkspaceId(UNSORTED_WORKSPACE.to_owned()),
            name: UNSORTED_NAME.to_owned(),
            icon: None,
            patterns: Vec::new(),
            folders: Vec::new(),
            folder_icons: HashMap::new(),
        };
        Ok(Self { workspaces, unsorted })
    }

    /// Places a message. The most specific matching pattern picks the workspace; inside it, the first folder rule that
    /// matches the sender picks the folder.
    #[must_use]
    pub fn route(&self, envelope: &Envelope) -> Route<'_> {
        let best = self
            .workspaces
            .iter()
            .filter_map(|workspace| {
                let pattern = workspace.patterns.iter().filter(|p| p.matches(&envelope.to)).max_by_key(|p| p.specificity())?;
                Some((pattern, workspace))
            })
            .max_by_key(|(pattern, _)| pattern.specificity());

        let Some((matched, workspace)) = best else {
            return Route { workspace: &self.unsorted.id, folder: None, matched: None, folder_matched: None };
        };
        let folder = workspace.folders.iter().find(|(from, _)| from.matches(&envelope.from));
        Route { workspace: &workspace.id, folder: folder.map(|(_, name)| name), matched: Some(matched), folder_matched: folder.map(|(from, _)| from) }
    }

    /// Every workspace, in file order, then the unsorted one.
    pub fn workspaces(&self) -> impl Iterator<Item = &Workspace> {
        self.workspaces.iter().chain(std::iter::once(&self.unsorted))
    }
}

/// Refuses an empty, reused or reserved id.
fn check_identity(workspace: &WorkspaceConfig, ids: &mut HashSet<String>) -> Result<(), ConfigError> {
    if workspace.id.trim().is_empty() || workspace.name.trim().is_empty() {
        return Err(ConfigError::EmptyWorkspace);
    }
    if workspace.id == UNSORTED_WORKSPACE {
        return Err(ConfigError::ReservedWorkspace(workspace.id.clone()));
    }
    if !ids.insert(workspace.id.clone()) {
        return Err(ConfigError::DuplicateWorkspace(workspace.id.clone()));
    }
    Ok(())
}

/// Parses every pattern in one workspace, naming the workspace on the first that fails.
fn check_workspace(workspace: WorkspaceConfig) -> Result<Workspace, ConfigError> {
    let in_workspace = |source| ConfigError::Pattern { workspace: workspace.id.clone(), source };
    let patterns = workspace.patterns.iter().map(|raw| Pattern::parse(raw)).collect::<Result<Vec<_>, _>>().map_err(in_workspace)?;
    let folders = workspace
        .folders
        .iter()
        .map(|rule| Pattern::parse(&rule.from).map(|from| (from, FolderName(rule.name.clone()))))
        .collect::<Result<Vec<_>, _>>()
        .map_err(in_workspace)?;
    let mut folder_icons = HashMap::new();
    for rule in &workspace.folders {
        if let Some(icon) = &rule.icon {
            folder_icons.entry(FolderName(rule.name.clone())).or_insert_with(|| icon.clone());
        }
    }
    Ok(Workspace { id: WorkspaceId(workspace.id), name: workspace.name, icon: workspace.icon, patterns, folders, folder_icons })
}
