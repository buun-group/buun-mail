//! Changing the routing file from the app: adding, editing and deleting workspaces, then reloading the router. The
//! file is edited in place, so its comments and layout survive, and a change that does not parse is undone.

use std::fs;

use buun_mail_routing::{Address, Config, Envelope, Router, UNSORTED_WORKSPACE};
use buun_mail_store::{Addressed, Placement};
use serde::{Deserialize, Serialize};
use toml_edit::{Array, ArrayOfTables, DocumentMut, InlineTable, Item, Table, Value, value};

use super::sent::SENT_FOLDER;
use super::{Actor, Mailbox, log};
use crate::error::AppError;
use crate::paths::file_error;

/// One workspace as the routing file writes it, for the editor in Settings. Saving one without an id adds it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceEdit {
    /// The stable id, `None` for a new workspace (one is made from the name).
    pub id: Option<String>,
    /// The name the sidebar shows.
    pub name: String,
    /// The addresses it owns: `sales@acme.com` or `*@acme.com`.
    pub addresses: Vec<String>,
    /// Its folders and the senders that land in each.
    pub folders: Vec<FolderEdit>,
}

/// One folder rule: mail from `from` lands in `name`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderEdit {
    /// The folder's name.
    pub name: String,
    /// The sender pattern.
    pub from: String,
    /// The folder's glyph from the file, kept as it was.
    #[serde(default)]
    pub icon: Option<String>,
}

impl Mailbox {
    /// Reads the routing file again and swaps the router in. Mail already stored keeps its place.
    ///
    /// # Errors
    ///
    /// [`AppError::Routing`] when the file no longer parses, which leaves the running router as it was.
    pub fn reload_routing(&self) -> Result<(), AppError> {
        let text = fs::read_to_string(&self.routing_path).map_err(|source| file_error(&self.routing_path, source))?;
        *self.router.write()? = Router::from_toml(&text)?;
        Ok(())
    }

    /// The routing file's workspaces, as the editor shows them.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the file cannot be read or does not parse.
    pub fn routing_workspaces(&self) -> Result<Vec<WorkspaceEdit>, AppError> {
        let config: Config = toml::from_str(&self.read_routing()?).map_err(|error| AppError::Unreadable(error.to_string()))?;
        Ok(config
            .workspaces
            .into_iter()
            .map(|workspace| WorkspaceEdit {
                id: Some(workspace.id),
                name: workspace.name,
                addresses: workspace.patterns,
                folders: workspace.folders.into_iter().map(|folder| FolderEdit { name: folder.name, from: folder.from, icon: folder.icon }).collect(),
            })
            .collect())
    }

    /// Adds a workspace, or changes the one with this id, then files Unsorted mail its addresses now claim. Returns
    /// the workspace's id.
    ///
    /// # Errors
    ///
    /// [`AppError`] when a field is empty, the id is unknown, or the file would not parse (it is then left as it was).
    pub fn save_workspace(&self, edit: &WorkspaceEdit, actor: &Actor) -> Result<String, AppError> {
        let edit = tidy(edit)?;
        let before = self.read_routing()?;
        let mut document = parse_document(&before)?;
        let list = workspace_list(&mut document)?;
        let id = if let Some(id) = &edit.id {
            let table = list.iter_mut().find(|table| table_id(table) == Some(id)).ok_or_else(|| unknown(id))?;
            fill(table, &edit);
            id.clone()
        } else {
            let id = self.free_id(&edit.name)?;
            let mut table = Table::new();
            table.insert("id", value(id.as_str()));
            fill(&mut table, &edit);
            list.push(table);
            id
        };
        self.write_routing(&before, &document.to_string())?;
        let filed = self.refile(UNSORTED_WORKSPACE)?;
        let store = self.store.lock()?;
        let verb = if edit.id.is_some() { "edit_workspace" } else { "add_workspace" };
        log(&store, actor, verb, format!("{} ({}), {filed} filed from Unsorted", edit.name, edit.addresses.join(", ")))?;
        Ok(id)
    }

    /// Deletes a workspace from the routing file and files its mail where routing now puts it, Unsorted when nothing
    /// claims it. Returns how many messages moved.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the id is unknown, or the file cannot be written or would not parse.
    pub fn delete_workspace(&self, id: &str, actor: &Actor) -> Result<usize, AppError> {
        let before = self.read_routing()?;
        let mut document = parse_document(&before)?;
        let list = workspace_list(&mut document)?;
        let index = list.iter().position(|table| table_id(table) == Some(id)).ok_or_else(|| unknown(id))?;
        let name = list.get(index).and_then(|table| table.get("name")).and_then(Item::as_str).unwrap_or(id).to_owned();
        list.remove(index);
        self.write_routing(&before, &document.to_string())?;
        let moved = self.refile(id)?;
        let store = self.store.lock()?;
        log(&store, actor, "delete_workspace", format!("{name}, {moved} messages filed again"))?;
        Ok(moved)
    }

    /// Makes sure mail to a domain has a workspace: when no workspace already claims `anyone@domain`, appends one named
    /// `name` that owns `*@domain`, and reloads. Returns true when it added one.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the file cannot be read or written, or the result would not parse (the file is then restored).
    pub fn ensure_workspace_for(&self, domain: &str, name: &str, actor: &Actor) -> Result<bool, AppError> {
        let domain = domain.trim().to_lowercase();
        let probe = Address::parse(&format!("anyone@{domain}")).map_err(|error| AppError::Unreadable(error.to_string()))?;
        let claimed = self.router.read()?.workspaces().any(|workspace| workspace.patterns().iter().any(|pattern| pattern.matches(&probe)));
        if claimed {
            return Ok(false);
        }
        let before = self.read_routing()?;
        let block = format!(
            "\n# Added by Buun Mail when {domain} was connected through the gateway.\n[[workspace]]\nid = \"{}\"\nname = \"{}\"\nmatch = [\"*@{domain}\"]\n",
            slug(&domain),
            name.replace('"', "'")
        );
        self.write_routing(&before, &format!("{}{block}", before.trim_end_matches('\n').to_owned() + "\n"))?;
        let store = self.store.lock()?;
        log(&store, actor, "add_workspace", format!("{name} for *@{domain}"))?;
        Ok(true)
    }

    fn read_routing(&self) -> Result<String, AppError> {
        fs::read_to_string(&self.routing_path).map_err(|source| file_error(&self.routing_path, source))
    }

    /// Writes the routing file and reloads; when the new file does not load, puts `before` back.
    fn write_routing(&self, before: &str, after: &str) -> Result<(), AppError> {
        fs::write(&self.routing_path, after).map_err(|source| file_error(&self.routing_path, source))?;
        if let Err(error) = self.reload_routing() {
            fs::write(&self.routing_path, before).map_err(|source| file_error(&self.routing_path, source))?;
            return Err(error);
        }
        Ok(())
    }

    /// An id from a name that no workspace, integration or Unsorted already uses: `Acme Ltd` becomes `acme-ltd`.
    fn free_id(&self, name: &str) -> Result<String, AppError> {
        let mut taken: Vec<String> = self.router.read()?.workspaces().map(|workspace| workspace.id().as_str().to_owned()).collect();
        taken.extend(self.provided.read()?.iter().map(|provided| provided.id.clone()));
        taken.push(UNSORTED_WORKSPACE.to_owned());
        let base = slug(name);
        let base = if base.is_empty() { "workspace".to_owned() } else { base };
        Ok((1..=10_000).map(|count| if count == 1 { base.clone() } else { format!("{base}-{count}") }).find(|id| !taken.contains(id)).unwrap_or(base))
    }

    /// Files every message in `workspace` again by its addresses, moving those routing now puts elsewhere. A copy in
    /// Sent follows the address it went from and stays in Sent. Returns how many moved.
    fn refile(&self, workspace: &str) -> Result<usize, AppError> {
        let router = self.router.read()?;
        let store = self.store.lock()?;
        let mut moved = 0;
        for Addressed { id, folder, from, to } in store.addressed_in(workspace)? {
            let sent = folder.as_deref() == Some(SENT_FOLDER);
            let (Ok(sender), Ok(recipient)) = (Address::parse(&from), Address::parse(if sent { &from } else { &to })) else { continue };
            let route = router.route(&Envelope { from: sender, to: recipient });
            if route.workspace.as_str() == workspace {
                continue;
            }
            let placement = Placement {
                workspace: route.workspace.as_str().to_owned(),
                folder: if sent { Some(SENT_FOLDER.to_owned()) } else { route.folder.map(|folder| folder.as_str().to_owned()) },
            };
            let matched = route.matched.map(ToString::to_string);
            let folder_matched = if sent { None } else { route.folder_matched.map(ToString::to_string) };
            store.refile(&id, &placement, matched.as_deref(), folder_matched.as_deref())?;
            moved += 1;
        }
        Ok(moved)
    }
}

/// The edit with its words trimmed, empty rows dropped and addresses lowercased, or what is missing.
fn tidy(edit: &WorkspaceEdit) -> Result<WorkspaceEdit, AppError> {
    let name = edit.name.trim().to_owned();
    if name.is_empty() {
        return Err(AppError::Unreadable("Give the workspace a name.".to_owned()));
    }
    let addresses: Vec<String> = edit.addresses.iter().map(|address| address.trim().to_lowercase()).filter(|address| !address.is_empty()).collect();
    if addresses.is_empty() {
        return Err(AppError::Unreadable("Add at least one address, such as *@example.com.".to_owned()));
    }
    let mut folders = Vec::new();
    for folder in &edit.folders {
        let (name, from) = (folder.name.trim(), folder.from.trim().to_lowercase());
        match (name.is_empty(), from.is_empty()) {
            (true, true) => {}
            (false, false) => folders.push(FolderEdit { name: name.to_owned(), from, icon: folder.icon.clone() }),
            _ => return Err(AppError::Unreadable("Each folder needs both a name and a sender, such as *@stripe.com.".to_owned())),
        }
    }
    Ok(WorkspaceEdit { id: edit.id.clone(), name, addresses, folders })
}

fn parse_document(text: &str) -> Result<DocumentMut, AppError> {
    text.parse().map_err(|error| AppError::Unreadable(format!("The routing file could not be read: {error}")))
}

/// The file's `[[workspace]]` list, made when the file has none yet.
fn workspace_list(document: &mut DocumentMut) -> Result<&mut ArrayOfTables, AppError> {
    document
        .entry("workspace")
        .or_insert(Item::ArrayOfTables(ArrayOfTables::new()))
        .as_array_of_tables_mut()
        .ok_or_else(|| AppError::Unreadable("The routing file's `workspace` is not a list of [[workspace]] tables.".to_owned()))
}

fn table_id(table: &Table) -> Option<&str> {
    table.get("id").and_then(Item::as_str)
}

fn unknown(id: &str) -> AppError {
    AppError::Unreadable(format!("No workspace `{id}` in the routing file; it may have been changed by hand. Reopen Settings."))
}

/// Writes the edit's name, addresses and folders into a workspace table, leaving its id, icon and comments alone.
fn fill(table: &mut Table, edit: &WorkspaceEdit) {
    table.insert("name", value(edit.name.as_str()));
    table.insert("match", value(edit.addresses.iter().map(String::as_str).collect::<Array>()));
    if edit.folders.is_empty() {
        table.remove("folders");
        return;
    }
    let mut folders = Array::new();
    for folder in &edit.folders {
        let mut rule = InlineTable::new();
        rule.insert("name", folder.name.as_str().into());
        rule.insert("from", folder.from.as_str().into());
        if let Some(icon) = &folder.icon {
            rule.insert("icon", icon.as_str().into());
        }
        let mut item = Value::InlineTable(rule);
        item.decor_mut().set_prefix("\n  ");
        folders.push_formatted(item);
    }
    folders.set_trailing_comma(true);
    folders.set_trailing("\n");
    table.insert("folders", value(folders));
}

/// A workspace id from a name or domain: `plotwork.dev` becomes `plotwork-dev`, `Acme Ltd` becomes `acme-ltd`.
fn slug(text: &str) -> String {
    let dashed: String = text.trim().to_lowercase().chars().map(|character| if character.is_ascii_alphanumeric() { character } else { '-' }).collect();
    dashed.split('-').filter(|part| !part.is_empty()).collect::<Vec<_>>().join("-")
}
