//! The mailbox the UI reads: the routing file and the local store, behind one lock each.

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

use buun_mail_message::body_text;
use buun_mail_routing::{Router, UNSORTED_NAME, UNSORTED_WORKSPACE};
use buun_mail_store::{Placement, Store, UnreadCount};

use crate::dto::{FolderDto, ImportFailureDto, ImportReportDto, MessageDetailDto, MessageDto, WorkspaceDto};
use crate::error::AppError;
use crate::ingest::{Incoming, ingest, messages_in};
use crate::paths::{AppPaths, file_error};

/// Every workspace and every message.
#[derive(Debug)]
pub struct Mailbox {
    router: RwLock<Router>,
    store: Mutex<Store>,
    routing_path: PathBuf,
}

impl Mailbox {
    /// Opens the mailbox from the app's folders, writing the example routing file on first run.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the routing file is invalid or the store cannot open.
    pub fn open(paths: &AppPaths) -> Result<Self, AppError> {
        Ok(Self::new(Router::from_toml(&paths.read_routing()?)?, Store::open(&paths.store)?, paths.routing.clone()))
    }

    /// A mailbox from parts, for tests and future sources.
    #[must_use]
    pub fn new(router: Router, store: Store, routing_path: PathBuf) -> Self {
        Self { router: RwLock::new(router), store: Mutex::new(store), routing_path }
    }

    /// Where the routing file lives, for the settings screen.
    #[must_use]
    pub fn routing_path(&self) -> &Path {
        &self.routing_path
    }

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

    /// Opens a message: marks it read and returns it with its text.
    ///
    /// # Errors
    ///
    /// [`AppError`] for an unknown id, or when the store cannot be read.
    pub fn open_message(&self, id: &str) -> Result<MessageDetailDto, AppError> {
        let store = self.store.lock()?;
        store.mark_read(id)?;
        let body = body_text(&store.raw(id)?);
        Ok(MessageDetailDto { message: store.get(id)?.into(), body })
    }

    /// Marks a folder read, or the whole workspace when `whole_workspace` is set. Returns how many changed.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the store cannot be written.
    pub fn mark_all_read(&self, placement: &Placement, whole_workspace: bool) -> Result<usize, AppError> {
        Ok(self.store.lock()?.mark_all_read(placement, whole_workspace)?)
    }

    /// Imports `.eml` and `.mbox` files. One bad message never stops the rest; each failure is reported. Returns the
    /// report and the messages that were new, newest first, for notifications.
    ///
    /// # Errors
    ///
    /// [`AppError`] only when the mailbox itself is unavailable.
    pub fn import_files(&self, files: &[PathBuf]) -> Result<(ImportReportDto, Vec<MessageDto>), AppError> {
        let router = self.router.read()?;
        let store = self.store.lock()?;
        let now = unix_now();
        let mut report = ImportReportDto::default();
        let mut arrived = Vec::new();

        for file in files {
            let name = file.file_name().map_or_else(|| file.display().to_string(), |name| name.to_string_lossy().into_owned());
            let bytes = match fs::read(file) {
                Ok(bytes) => bytes,
                Err(source) => {
                    report.failed.push(ImportFailureDto { source: name, reason: file_error(file, source).to_string() });
                    continue;
                }
            };
            let messages = messages_in(&bytes);
            let many = messages.len() > 1;
            for (index, raw) in messages.iter().enumerate() {
                match ingest(Incoming { raw, envelope_to: None, received_at: now }, &router, &store) {
                    Ok(Some(record)) => {
                        report.added += 1;
                        arrived.push(MessageDto::from(record));
                    }
                    Ok(None) => report.duplicates += 1,
                    Err(error) => {
                        let source = if many { format!("{name}, message {}", index + 1) } else { name.clone() };
                        report.failed.push(ImportFailureDto { source, reason: error.to_string() });
                    }
                }
            }
        }
        arrived.sort_by(|a, b| b.received_at.cmp(&a.received_at));
        Ok((report, arrived))
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

/// Now, in Unix seconds. A clock before 1970 counts as 1970.
fn unix_now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |elapsed| i64::try_from(elapsed.as_secs()).unwrap_or(i64::MAX))
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;
    use crate::paths::EXAMPLE_ROUTING;

    const STRIPE: &str = "From: Stripe <receipts@stripe.com>\r\nDelivered-To: me@personal.example\r\nTo: me@personal.example\r\nSubject: Your receipt\r\nDate: Tue, 17 Nov 2026 09:12:00 +0000\r\n\r\nReceipt 2041.\r\n";
    const CLIENT: &str = "From: A client <projects@client.example>\r\nTo: hello@buungroup.com\r\nSubject: Quote\r\nDate: Wed, 18 Nov 2026 23:05:00 +0000\r\n\r\nCould you send the quote?\r\n";
    const STRANGER: &str = "From: news@letters.example\r\nTo: old@forwarded.example\r\nSubject: News\r\n\r\nHi.\r\n";

    fn mailbox() -> (tempfile::TempDir, Mailbox) {
        let folder = tempfile::tempdir().unwrap_or_else(|error| unreachable!("temp folder: {error}"));
        let router = Router::from_toml(EXAMPLE_ROUTING).unwrap_or_else(|error| unreachable!("example routing: {error}"));
        let store = Store::open(&folder.path().join("store")).unwrap_or_else(|error| unreachable!("store: {error}"));
        let mailbox = Mailbox::new(router, store, folder.path().join("workspaces.toml"));
        (folder, mailbox)
    }

    fn file(folder: &tempfile::TempDir, name: &str, contents: &str) -> PathBuf {
        let path = folder.path().join(name);
        fs::write(&path, contents).unwrap_or_else(|error| unreachable!("fixture file: {error}"));
        path
    }

    fn placement(workspace: &str, folder: Option<&str>) -> Placement {
        Placement { workspace: workspace.to_owned(), folder: folder.map(str::to_owned) }
    }

    #[test]
    fn imports_and_routes_eml_files_once() -> Result<(), AppError> {
        let (folder, mailbox) = mailbox();
        let files = [file(&folder, "stripe.eml", STRIPE), file(&folder, "client.eml", CLIENT)];
        let (first, arrived) = mailbox.import_files(&files)?;
        assert_eq!(arrived.len(), 2);
        assert_eq!((first.added, first.duplicates), (2, 0));
        let (again, arrived) = mailbox.import_files(&files)?;
        assert_eq!(arrived, []);
        assert_eq!((again.added, again.duplicates), (0, 2));

        let receipts = mailbox.messages(&placement("personal", Some("Receipts")))?;
        assert_eq!(receipts.len(), 1);
        assert_eq!(receipts.first().map(|message| message.folder_matched.as_deref()), Some(Some("*@stripe.com")));
        assert_eq!(mailbox.messages(&placement("buun", None))?.len(), 1);
        Ok(())
    }

    #[test]
    fn splits_an_mbox_and_reports_what_failed() -> Result<(), AppError> {
        let (folder, mailbox) = mailbox();
        let mbox = format!("From a Thu Nov 19 07:42:00 2026\n{}\nFrom b Thu Nov 19 07:43:00 2026\nSubject: no sender\n\nx\n", CLIENT.replace("\r\n", "\n"));
        let (report, _) = mailbox.import_files(&[file(&folder, "export.mbox", &mbox), folder.path().join("missing.eml")])?;
        assert_eq!(report.added, 1);
        let sources: Vec<_> = report.failed.iter().map(|failure| failure.source.as_str()).collect();
        assert_eq!(sources, ["export.mbox, message 2", "missing.eml"]);
        Ok(())
    }

    #[test]
    fn shows_unsorted_only_once_it_holds_mail() -> Result<(), AppError> {
        let (folder, mailbox) = mailbox();
        assert!(mailbox.workspaces()?.iter().all(|workspace| workspace.id != UNSORTED_WORKSPACE));
        mailbox.import_files(&[file(&folder, "stranger.eml", STRANGER)])?;
        let workspaces = mailbox.workspaces()?;
        let unsorted = workspaces.iter().find(|workspace| workspace.id == UNSORTED_WORKSPACE);
        assert_eq!(unsorted.map(|workspace| workspace.unread), Some(1));
        Ok(())
    }

    #[test]
    fn opening_a_message_reads_its_body_and_marks_it_read() -> Result<(), AppError> {
        let (folder, mailbox) = mailbox();
        mailbox.import_files(&[file(&folder, "client.eml", CLIENT)])?;
        let id = mailbox.messages(&placement("buun", None))?.first().map(|message| message.id.clone()).unwrap_or_default();
        let detail = mailbox.open_message(&id)?;
        assert_eq!(detail.body, "Could you send the quote?");
        assert!(!detail.message.unread);
        assert_eq!(mailbox.workspaces()?.iter().map(|workspace| workspace.unread).sum::<u32>(), 0);
        Ok(())
    }

    #[test]
    fn marks_a_workspace_read() -> Result<(), AppError> {
        let (folder, mailbox) = mailbox();
        mailbox.import_files(&[file(&folder, "client.eml", CLIENT)])?;
        assert_eq!(mailbox.mark_all_read(&placement("buun", None), true)?, 1);
        Ok(())
    }
}
