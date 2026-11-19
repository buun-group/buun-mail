//! The ways an address or a routing file can be wrong. Each says what to fix, never only that something failed.

use thiserror::Error;

/// An address that cannot be read as `local@domain`.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum AddressError {
    /// No `@`, or more than one.
    #[error("`{0}` is not an address: it needs exactly one @")]
    MissingAt(String),
    /// Nothing before the `@`.
    #[error("`{0}` has nothing before the @")]
    EmptyLocal(String),
    /// Nothing after the `@`, or a domain without a dot.
    #[error("`{0}` needs a domain such as example.com after the @")]
    BadDomain(String),
}

/// A routing file that cannot be used. Nothing is half-loaded: a router is built from a whole valid file or not at all.
#[derive(Debug, Error)]
pub enum ConfigError {
    /// The file is not valid TOML, or a field has the wrong shape.
    #[error("the routing file is not valid: {0}")]
    Parse(#[from] toml::de::Error),
    /// A pattern in `match` or `from` cannot be read.
    #[error("workspace `{workspace}`: {source}")]
    Pattern {
        /// The workspace the pattern is in.
        workspace: String,
        /// What is wrong with it.
        source: AddressError,
    },
    /// Two workspaces share an id.
    #[error("two workspaces have the id `{0}`; each id must be unique")]
    DuplicateWorkspace(String),
    /// The id the router keeps for mail no workspace claims.
    #[error("`{0}` is kept for mail no workspace claims; choose another id")]
    ReservedWorkspace(String),
    /// Two workspaces claim the same pattern, so a message to it would have two homes.
    #[error("`{pattern}` is claimed by both `{first}` and `{second}`")]
    DuplicatePattern {
        /// The pattern both claim.
        pattern: String,
        /// The workspace that claimed it first.
        first: String,
        /// The workspace that claimed it again.
        second: String,
    },
    /// A workspace with an empty id or name.
    #[error("a workspace needs both an id and a name")]
    EmptyWorkspace,
}
