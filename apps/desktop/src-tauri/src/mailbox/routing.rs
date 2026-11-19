//! Changing the routing file from the app: adding a workspace for a new domain, then reloading the router. The file
//! is only ever appended to, so its comments and layout survive, and a change that does not parse is undone.

use std::fs;

use buun_mail_routing::{Address, Router};

use super::{Actor, Mailbox, log};
use crate::error::AppError;
use crate::paths::file_error;

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
        let before = fs::read_to_string(&self.routing_path).map_err(|source| file_error(&self.routing_path, source))?;
        let block = format!(
            "\n# Added by Buun Mail when {domain} was connected through the gateway.\n[[workspace]]\nid = \"{}\"\nname = \"{}\"\nmatch = [\"*@{domain}\"]\n",
            slug(&domain),
            name.replace('"', "'")
        );
        fs::write(&self.routing_path, format!("{}{block}", before.trim_end_matches('\n').to_owned() + "\n"))
            .map_err(|source| file_error(&self.routing_path, source))?;
        if let Err(error) = self.reload_routing() {
            fs::write(&self.routing_path, before).map_err(|source| file_error(&self.routing_path, source))?;
            return Err(error);
        }
        let store = self.store.lock()?;
        log(&store, actor, "add_workspace", format!("{name} for *@{domain}"))?;
        Ok(true)
    }
}

/// A workspace id from a domain: `plotwork.dev` becomes `plotwork-dev`.
fn slug(domain: &str) -> String {
    domain.chars().map(|character| if character.is_ascii_alphanumeric() { character } else { '-' }).collect()
}
