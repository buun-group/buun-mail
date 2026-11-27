//! dissolve.email's side of signing in: the scopes it asks for and Buun Mail's own client there. The flow itself
//! (discovery, registration, PKCE, the way back, tokens) is the shared `crate::oauth`.

pub use crate::oauth::*;

/// What the app asks for: who you are, your inboxes and their mail. Never the vault, webhooks or rules.
pub const SCOPES: &str = "profile email inboxes:read inboxes:write messages:read messages:write";

/// Added to [`SCOPES`] once the person turns agent identities on. Kept apart because dissolve.email's approval page
/// refuses a request for a scope the plan lacks, so asking for it on Free would stop the sign-in.
pub const IDENTITY_SCOPES: &str = "identities:read identities:write";

/// The scopes to ask for: [`SCOPES`], plus [`IDENTITY_SCOPES`] with `identities`.
#[must_use]
pub fn scopes(identities: bool) -> String {
    if identities { format!("{SCOPES} {IDENTITY_SCOPES}") } else { SCOPES.to_owned() }
}

/// Buun Mail's own client on dissolve.email, made there as code (its migrations 071 and 073): first-party, so the
/// approval page shows it as verified, with both ways back ([`REDIRECT`] and [`APP_LINK`]) already allowed.
pub const FIRST_PARTY_CLIENT: &str = "sys_buun_mail";

/// The server Buun Mail's own client lives on. Any other server (self-hosted, local) gets a registered client.
pub const FIRST_PARTY_SERVER: &str = "https://api.dissolve.email";

/// The client id to sign in with on `server` without registering: [`FIRST_PARTY_CLIENT`] on dissolve.email itself.
#[must_use]
pub fn first_party_client(server: &str) -> Option<&'static str> {
    (server.trim_end_matches('/').eq_ignore_ascii_case(FIRST_PARTY_SERVER)).then_some(FIRST_PARTY_CLIENT)
}

#[cfg(test)]
mod unit {
    use super::*;

    #[test]
    fn asks_for_identities_only_when_turned_on() {
        assert!(!scopes(false).contains("identities"), "Free accounts could not approve a request for identities");
        assert!(scopes(true).ends_with("messages:write identities:read identities:write"));
    }

    #[test]
    fn signs_in_on_dissolve_email_as_its_own_verified_client_and_registers_anywhere_else() {
        for server in ["https://api.dissolve.email", "https://api.dissolve.email/", "HTTPS://API.DISSOLVE.EMAIL"] {
            assert_eq!(first_party_client(server), Some(FIRST_PARTY_CLIENT), "{server}");
        }
        for server in ["http://127.0.0.1:8787", "https://dissolve.example", "https://api.dissolve.email.evil"] {
            assert_eq!(first_party_client(server), None, "{server}");
        }
    }
}
