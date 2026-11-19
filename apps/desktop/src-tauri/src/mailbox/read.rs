//! Reading: workspaces with counts, a folder's messages, one message, search, tags and the activity log.

use std::collections::BTreeSet;

use buun_mail_message::{attachments, authentication, body_text, html_view, recipients};
use buun_mail_routing::{UNSORTED_NAME, UNSORTED_WORKSPACE};
use buun_mail_store::{Placement, UnreadCount, View};

use super::Mailbox;
use crate::dto::{ActivityDto, FolderDto, HtmlDto, MessageDetailDto, MessageDto, TagCountDto, WorkspaceDto};
use crate::error::AppError;

/// How many activity entries the log returns at most.
pub const ACTIVITY_LIMIT: usize = 200;

impl Mailbox {
    /// Every workspace with its folders and unread counts, in sidebar order.
    ///
    /// The routing file sets the order. Folders that hold mail but the file no longer names still show, so nothing
    /// stored is ever hidden; so do workspaces the file dropped, and Unsorted while it holds mail.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the store cannot be read.
    pub fn workspaces(&self) -> Result<Vec<WorkspaceDto>, AppError> {
        let router = self.router.read()?;
        let store = self.store.lock()?;
        let counts = store.unread_counts()?;
        let stored: BTreeSet<Placement> = store.placements()?.into_iter().collect();
        let unread = |workspace: &str, folder: Option<&str>| unread_in(&counts, workspace, folder);

        let mut workspaces: Vec<WorkspaceDto> = router
            .workspaces()
            .filter(|workspace| workspace.id().as_str() != UNSORTED_WORKSPACE)
            .map(|workspace| {
                let id = workspace.id().as_str();
                let mut folders = vec![FolderDto { name: None, icon: None, unread: unread(id, None) }];
                folders.extend(workspace.folders().map(|folder| FolderDto {
                    name: Some(folder.as_str().to_owned()),
                    icon: workspace.folder_icon(folder).map(str::to_owned),
                    unread: unread(id, Some(folder.as_str())),
                }));
                WorkspaceDto {
                    id: id.to_owned(),
                    name: workspace.name().to_owned(),
                    icon: workspace.icon().map(str::to_owned),
                    addresses: workspace.patterns().iter().map(ToString::to_string).collect(),
                    folders,
                    unread: 0,
                }
            })
            .collect();
        for provided in self.provided.read()?.iter() {
            if workspaces.iter().all(|workspace| workspace.id != provided.id) {
                workspaces.push(provided.dto(&unread));
            }
        }

        // Mail the routing file no longer accounts for: folders and workspaces it dropped, and Unsorted.
        for placement in &stored {
            let index = workspaces.iter().position(|workspace| workspace.id == placement.workspace).unwrap_or_else(|| {
                workspaces.push(unlisted_workspace(&placement.workspace));
                workspaces.len() - 1
            });
            let Some(workspace) = workspaces.get_mut(index) else { continue };
            if !workspace.folders.iter().any(|folder| folder.name == placement.folder) {
                let unread = unread(&placement.workspace, placement.folder.as_deref());
                workspace.folders.push(FolderDto { name: placement.folder.clone(), icon: None, unread });
            }
        }
        for workspace in &mut workspaces {
            workspace.folders.sort_by_key(|folder| folder.name.is_some());
            workspace.unread = workspace.folders.iter().map(|folder| folder.unread).sum();
        }
        Ok(workspaces)
    }

    /// The messages in one folder, newest first.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the store cannot be read.
    pub fn messages(&self, placement: &Placement) -> Result<Vec<MessageDto>, AppError> {
        Ok(self.store.lock()?.list(placement)?.into_iter().map(MessageDto::from).collect())
    }

    /// A list across every workspace: starred, archived or the trash.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the store cannot be read.
    pub fn view(&self, view: View) -> Result<Vec<MessageDto>, AppError> {
        Ok(self.store.lock()?.view(view)?.into_iter().map(MessageDto::from).collect())
    }

    /// Opens a message: marks it read and returns it with its text.
    ///
    /// # Errors
    ///
    /// [`AppError`] for an unknown id, or when the store cannot be read.
    pub fn open_message(&self, id: &str) -> Result<MessageDetailDto, AppError> {
        let store = self.store.lock()?;
        store.mark_read(id)?;
        let raw = store.raw(id)?;
        Ok(detail(store.get(id)?.into(), &raw))
    }

    /// One message with its text, without marking it read. For agents, which read without being seen to.
    ///
    /// # Errors
    ///
    /// [`AppError`] for an unknown id, or when the store cannot be read.
    pub fn read_message(&self, id: &str) -> Result<MessageDetailDto, AppError> {
        let store = self.store.lock()?;
        let raw = store.raw(id)?;
        Ok(detail(store.get(id)?.into(), &raw))
    }

    /// Messages matching `query` in subject, sender, recipient, preview or tags, newest first.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the store cannot be read.
    pub fn search(&self, query: &str, workspace: Option<&str>, unread_only: bool, limit: usize) -> Result<Vec<MessageDto>, AppError> {
        Ok(self.store.lock()?.search(query, workspace, unread_only, limit)?.into_iter().map(MessageDto::from).collect())
    }

    /// Every tag in use, most used first.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the store cannot be read.
    pub fn tags(&self) -> Result<Vec<TagCountDto>, AppError> {
        Ok(self.store.lock()?.tag_counts()?.into_iter().map(|(tag, count)| TagCountDto { tag, count }).collect())
    }

    /// The latest changes by people, rules and agents, newest first.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the store cannot be read.
    pub fn activity(&self, limit: usize) -> Result<Vec<ActivityDto>, AppError> {
        Ok(self.store.lock()?.activity(limit.min(ACTIVITY_LIMIT))?.into_iter().map(ActivityDto::from).collect())
    }
}

/// A workspace that holds mail but is not in the routing file: Unsorted, or one the file dropped. Named by its id.
fn unlisted_workspace(id: &str) -> WorkspaceDto {
    let name = if id == UNSORTED_WORKSPACE { UNSORTED_NAME.to_owned() } else { id.to_owned() };
    WorkspaceDto { id: id.to_owned(), name, icon: None, addresses: Vec::new(), folders: Vec::new(), unread: 0 }
}

/// Unread messages in one folder, from the store's counts.
fn unread_in(counts: &[UnreadCount], workspace: &str, folder: Option<&str>) -> u32 {
    counts.iter().find(|count| count.placement.workspace == workspace && count.placement.folder.as_deref() == folder).map_or(0, |count| count.unread)
}

/// An open message from its summary and its original bytes: text, recipients, HTML and attachments.
fn detail(message: MessageDto, raw: &[u8]) -> MessageDetailDto {
    MessageDetailDto {
        message,
        body: body_text(raw),
        recipients: recipients(raw).into(),
        html: html_view(raw).map(|view| HtmlDto { html: view.html, remote: view.remote }),
        attachments: attachments(raw).into_iter().map(Into::into).collect(),
        authentication: authentication(raw).map(Into::into),
    }
}
