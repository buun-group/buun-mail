//! Workspaces an integration brings rather than the routing file: dissolve.email's, with one folder per disposable
//! inbox. They show beside the file's workspaces, folders listed even while empty, and go when the integration does.

use super::Mailbox;
use crate::dto::{FolderDto, WorkspaceDto};
use crate::error::AppError;

/// A workspace an integration keeps up to date.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProvidedWorkspace {
    /// The stable id stored with every message in it. Never shared with a routing file workspace.
    pub id: String,
    /// The name shown.
    pub name: String,
    /// The glyph key, as in the routing file.
    pub icon: Option<String>,
    /// The addresses it receives for, shown in the workspace header.
    pub addresses: Vec<String>,
    /// Its folders by name, in order. The workspace's own inbox comes first and is not listed.
    pub folders: Vec<String>,
}

impl ProvidedWorkspace {
    /// The sidebar entry, with unread counts from `unread`.
    pub(super) fn dto(&self, unread: &dyn Fn(&str, Option<&str>) -> u32) -> WorkspaceDto {
        let mut folders = vec![FolderDto { name: None, icon: None, unread: unread(&self.id, None) }];
        folders.extend(self.folders.iter().map(|name| FolderDto { name: Some(name.clone()), icon: None, unread: unread(&self.id, Some(name)) }));
        WorkspaceDto {
            id: self.id.clone(),
            name: self.name.clone(),
            icon: self.icon.clone(),
            addresses: self.addresses.clone(),
            folders,
            unread: 0,
            editable: false,
        }
    }
}

impl Mailbox {
    /// Adds or replaces the workspace with this id.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the lock is poisoned.
    pub fn provide_workspace(&self, workspace: ProvidedWorkspace) -> Result<(), AppError> {
        let mut provided = self.provided.write()?;
        provided.retain(|kept| kept.id != workspace.id);
        provided.push(workspace);
        Ok(())
    }

    /// Takes the workspace with this id out of the sidebar. Mail stored in it still shows, as for any workspace the
    /// routing file dropped, until it is deleted.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the lock is poisoned.
    pub fn withdraw_workspace(&self, id: &str) -> Result<(), AppError> {
        self.provided.write()?.retain(|kept| kept.id != id);
        Ok(())
    }
}
