//! Rules: list, save, delete, and re-run over mail already stored.

use buun_mail_routing::Address;
use buun_mail_rules::{Facts, Rule, evaluate};
use buun_mail_store::{Placement, Shelf, StoredRule};

use super::{Actor, Mailbox, load_rules, log, unix_now};
use crate::error::AppError;

impl Mailbox {
    /// Every rule, in the order they run, including ones turned off.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the store cannot be read.
    pub fn rules(&self) -> Result<Vec<Rule>, AppError> {
        Ok(self.store.lock()?.rules()?.iter().filter_map(|stored| Rule::from_json(&stored.body).ok()).collect())
    }

    /// Adds a rule, or replaces the one with the same id. A rule without an id gets one. Returns the saved rule.
    ///
    /// # Errors
    ///
    /// [`AppError::Rule`] when the rule does not pass its check, or [`AppError`] when the store fails.
    pub fn save_rule(&self, mut rule: Rule, actor: &Actor) -> Result<Rule, AppError> {
        rule.check()?;
        if rule.id.trim().is_empty() {
            rule.id = format!("rule-{}-{}", unix_now(), self.store.lock()?.rules()?.len() + 1);
        }
        let store = self.store.lock()?;
        store.save_rule(&StoredRule { id: rule.id.clone(), body: rule.to_json() })?;
        log(&store, actor, "save_rule", rule.name.clone())?;
        *self.rules.write()? = load_rules(&store)?;
        Ok(rule)
    }

    /// Deletes a rule. Returns false when there was none with that id.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the store fails.
    pub fn delete_rule(&self, id: &str, actor: &Actor) -> Result<bool, AppError> {
        let store = self.store.lock()?;
        let deleted = store.delete_rule(id)?;
        if deleted {
            log(&store, actor, "delete_rule", id.to_owned())?;
            *self.rules.write()? = load_rules(&store)?;
        }
        Ok(deleted)
    }

    /// Runs every rule over the mail already stored, as if each message had just arrived. Tags are added, moves made
    /// and read marks set; nothing is undone. Returns how many messages a rule changed.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the store fails.
    pub fn apply_rules_to_stored(&self, actor: &Actor) -> Result<usize, AppError> {
        let rules = self.rules.read()?;
        let store = self.store.lock()?;
        let mut changed = 0;
        let needs_body = rules.iter().any(buun_mail_rules::CheckedRule::needs_body);
        for message in store.all()? {
            let (Ok(from), Ok(to)) = (Address::parse(&message.from), Address::parse(&message.to)) else { continue };
            let words = if needs_body { crate::ingest::rule_words(&store.raw(&message.id).unwrap_or_default()) } else { String::new() };
            let facts = Facts {
                workspace: &message.placement.workspace,
                folder: message.placement.folder.as_deref(),
                from: &from,
                to: &to,
                subject: &message.subject,
                body: &words,
                tags: &message.tags,
            };
            let outcome = evaluate(&rules, &facts);
            if outcome.fired.is_empty() {
                continue;
            }
            let new_tags: Vec<String> = outcome.tags.iter().filter(|tag| !message.tags.contains(tag)).cloned().collect();
            store.add_tags(&message.id, &new_tags)?;
            let moved = outcome.moved_to.map(|(workspace, folder)| Placement { workspace, folder }).filter(|placement| *placement != message.placement);
            if let Some(placement) = &moved {
                store.move_to(&message.id, placement)?;
            }
            let read = outcome.mark_read && message.unread && store.mark_read(&message.id)?;
            let trashed = outcome.trash && message.shelf != Shelf::Trashed && store.set_shelf(&message.id, Shelf::Trashed, unix_now())?;
            if !new_tags.is_empty() || moved.is_some() || read || trashed {
                changed += 1;
            }
        }
        log(&store, actor, "apply_rules", format!("{changed} messages changed"))?;
        Ok(changed)
    }
}
