//! Help with writing: saved replies (templates), each for every workspace or one, and a profile per workspace (the
//! signature its mail carries and the address new mail starts from). Saved in `writing.json`, readable by this user only.

#[cfg(test)]
mod tests;

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::paths::write_private;

const FILE: &str = "writing.json";

/// A saved reply.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Template {
    /// Its id; empty when adding one.
    #[serde(default)]
    pub id: String,
    /// What the person calls it: "Quote sent", "Refund done".
    pub name: String,
    /// The workspace it is for, or none for every workspace.
    #[serde(default)]
    pub workspace: Option<String>,
    /// The subject it fills in when the message has none yet.
    #[serde(default)]
    pub subject: String,
    /// The words it inserts.
    pub text: String,
}

/// A workspace's own way of writing.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Profile {
    /// The signature its mail carries, in place of the sender's; empty to keep the sender's.
    pub signature: String,
    /// The address new mail in it starts from; empty to pick the first that can send.
    pub from: String,
}

/// Every template and profile, as the window reads them.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Writing {
    /// The templates, in the order added.
    pub templates: Vec<Template>,
    /// Profiles by workspace id.
    pub profiles: BTreeMap<String, Profile>,
    #[serde(skip_serializing)]
    next: u64,
}

/// The templates and profiles.
pub struct WritingStore {
    config_folder: PathBuf,
    writing: Mutex<Writing>,
}

impl WritingStore {
    /// Loads what was saved.
    #[must_use]
    pub fn open(config_folder: PathBuf) -> Self {
        let mut writing: Writing = std::fs::read_to_string(config_folder.join(FILE)).ok().and_then(|text| serde_json::from_str(&text).ok()).unwrap_or_default();
        writing.next = writing.templates.len() as u64;
        Self { config_folder, writing: Mutex::new(writing) }
    }

    /// Everything, for the window.
    ///
    /// # Errors
    ///
    /// After an earlier failure, in words.
    pub fn read(&self) -> Result<Writing, String> {
        self.writing.lock().map(|writing| writing.clone()).map_err(|error| error.to_string())
    }

    fn change(&self, edit: impl FnOnce(&mut Writing) -> Result<(), String>) -> Result<Writing, String> {
        let mut writing = self.writing.lock().map_err(|error| error.to_string())?;
        edit(&mut writing)?;
        let saved = Writing { templates: writing.templates.clone(), profiles: writing.profiles.clone(), next: 0 };
        write_private(&self.config_folder.join(FILE), &serde_json::to_string_pretty(&saved).unwrap_or_default()).map_err(|error| error.to_string())?;
        Ok(writing.clone())
    }

    /// Adds a template, or replaces the one with its id.
    ///
    /// # Errors
    ///
    /// When it has no name or no words, or cannot be saved.
    pub fn save_template(&self, mut template: Template) -> Result<Writing, String> {
        let trimmed = template.name.trim().to_owned();
        template.name = trimmed;
        if template.name.is_empty() || template.text.trim().is_empty() {
            return Err("Give the template a name and some words.".to_owned());
        }
        template.workspace = template.workspace.filter(|workspace| !workspace.trim().is_empty());
        self.change(|writing| {
            if template.id.is_empty() {
                writing.next += 1;
                let mut number = writing.next;
                while writing.templates.iter().any(|kept| kept.id == format!("template-{number}")) {
                    number += 1;
                }
                template.id = format!("template-{number}");
                writing.templates.push(template);
            } else if let Some(kept) = writing.templates.iter_mut().find(|kept| kept.id == template.id) {
                *kept = template;
            } else {
                return Err("That template was removed.".to_owned());
            }
            Ok(())
        })
    }

    /// Forgets a template.
    ///
    /// # Errors
    ///
    /// When it cannot be saved.
    pub fn delete_template(&self, id: &str) -> Result<Writing, String> {
        self.change(|writing| {
            writing.templates.retain(|kept| kept.id != id);
            Ok(())
        })
    }

    /// Sets a workspace's profile; an empty one is forgotten.
    ///
    /// # Errors
    ///
    /// When it cannot be saved.
    pub fn save_profile(&self, workspace: &str, profile: &Profile) -> Result<Writing, String> {
        let profile = Profile { signature: profile.signature.trim_end().to_owned(), from: profile.from.trim().to_lowercase() };
        self.change(|writing| {
            if profile == Profile::default() {
                writing.profiles.remove(workspace);
            } else {
                writing.profiles.insert(workspace.to_owned(), profile);
            }
            Ok(())
        })
    }
}
