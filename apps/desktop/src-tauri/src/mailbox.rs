//! The mailbox the UI reads: a router and the messages it has placed. In memory for now; a local store replaces the
//! message list later without changing the commands.

use buun_mail_routing::{AddressError, ConfigError, Envelope, Router};
use thiserror::Error;

use crate::demo::{DEMO_MESSAGES, DEMO_ROUTING};
use crate::dto::{FolderDto, MessageDto, WorkspaceDto};

/// Why the mailbox could not load.
#[derive(Debug, Error)]
pub enum LoadError {
    /// The routing file is invalid.
    #[error(transparent)]
    Routing(#[from] ConfigError),
    /// A stored message has an unreadable address.
    #[error("message {id}: {source}")]
    Message {
        /// The message.
        id: String,
        /// What is wrong.
        source: AddressError,
    },
}

/// Every workspace and every message, placed.
#[derive(Debug)]
pub struct Mailbox {
    router: Router,
    messages: Vec<MessageDto>,
}

impl Mailbox {
    /// The demo mailbox: the example routing file and a handful of messages, so the UI has something real to show.
    ///
    /// # Errors
    ///
    /// [`LoadError`] when the routing file or a demo address is invalid. A test holds both valid.
    pub fn demo() -> Result<Self, LoadError> {
        let router = Router::from_toml(DEMO_ROUTING)?;
        let messages = DEMO_MESSAGES
            .iter()
            .map(|demo| {
                let envelope = Envelope::parse(demo.from, demo.to).map_err(|source| LoadError::Message { id: demo.id.to_owned(), source })?;
                let route = router.route(&envelope);
                Ok(MessageDto {
                    id: demo.id.to_owned(),
                    workspace: route.workspace.as_str().to_owned(),
                    folder: route.folder.map(|folder| folder.as_str().to_owned()),
                    from_name: demo.from_name.to_owned(),
                    from: envelope.from.to_string(),
                    to: envelope.to.to_string(),
                    matched: route.matched.map(ToString::to_string),
                    folder_matched: route.folder_matched.map(ToString::to_string),
                    subject: demo.subject.to_owned(),
                    preview: demo.preview.to_owned(),
                    received_at: demo.received_at.to_owned(),
                    unread: demo.unread,
                })
            })
            .collect::<Result<Vec<_>, LoadError>>()?;
        Ok(Self { router, messages })
    }

    /// Every workspace with its folders and unread counts, in sidebar order. Unsorted is left out while it is empty.
    #[must_use]
    pub fn workspaces(&self) -> Vec<WorkspaceDto> {
        self.router
            .workspaces()
            .map(|workspace| {
                let id = workspace.id().as_str();
                let inbox = FolderDto { name: None, unread: self.unread_in(id, None) };
                let folders =
                    workspace.folders().map(|folder| FolderDto { name: Some(folder.as_str().to_owned()), unread: self.unread_in(id, Some(folder.as_str())) });
                WorkspaceDto {
                    id: id.to_owned(),
                    name: workspace.name().to_owned(),
                    addresses: workspace.patterns().iter().map(ToString::to_string).collect(),
                    folders: std::iter::once(inbox).chain(folders).collect(),
                    unread: self.messages.iter().filter(|m| m.workspace == id && m.unread).count(),
                }
            })
            .filter(|workspace| !workspace.addresses.is_empty() || self.messages.iter().any(|m| m.workspace == workspace.id))
            .collect()
    }

    /// The messages in one folder, newest first. `folder` of `None` is the inbox.
    #[must_use]
    pub fn messages(&self, workspace: &str, folder: Option<&str>) -> Vec<MessageDto> {
        let mut found: Vec<_> = self.messages.iter().filter(|m| m.workspace == workspace && m.folder.as_deref() == folder).cloned().collect();
        found.sort_by(|a, b| b.received_at.cmp(&a.received_at));
        found
    }

    fn unread_in(&self, workspace: &str, folder: Option<&str>) -> usize {
        self.messages.iter().filter(|m| m.workspace == workspace && m.folder.as_deref() == folder && m.unread).count()
    }
}

#[cfg(test)]
mod tests {
    use buun_mail_routing::UNSORTED_WORKSPACE;

    use super::*;

    fn mailbox() -> Mailbox {
        Mailbox::demo().unwrap_or_else(|error| unreachable!("the demo mailbox must load: {error}"))
    }

    #[test]
    fn every_demo_message_is_placed() {
        let mailbox = mailbox();
        let placed: usize = mailbox.workspaces().iter().flat_map(|w| w.folders.iter().map(|f| mailbox.messages(&w.id, f.name.as_deref()).len())).sum();
        assert_eq!(placed, DEMO_MESSAGES.len());
    }

    #[test]
    fn receipts_from_stripe_land_in_the_right_workspace() {
        let receipts = mailbox().messages("personal", Some("Receipts"));
        assert!(!receipts.is_empty());
        assert!(receipts.iter().all(|m| m.from.ends_with("@stripe.com")));
    }

    #[test]
    fn lists_newest_first() {
        let inbox = mailbox().messages("buun", None);
        assert!(inbox.windows(2).all(|pair| pair[0].received_at >= pair[1].received_at));
    }

    #[test]
    fn shows_unsorted_only_when_it_holds_mail() {
        let mailbox = mailbox();
        let has_unsorted = mailbox.workspaces().iter().any(|w| w.id == UNSORTED_WORKSPACE);
        assert_eq!(has_unsorted, !mailbox.messages(UNSORTED_WORKSPACE, None).is_empty());
    }

    #[test]
    fn the_inbox_comes_first_and_counts_add_up() {
        for workspace in mailbox().workspaces() {
            assert_eq!(workspace.folders.first().map(|f| f.name.is_none()), Some(true));
            assert_eq!(workspace.unread, workspace.folders.iter().map(|f| f.unread).sum::<usize>());
        }
    }
}
