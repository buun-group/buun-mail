//! Routing for Buun Mail: which workspace and folder a message belongs to.
//!
//! Every business domain points its MX at Cloudflare Email Routing, and one catch-all Email Worker receives the lot.
//! The envelope recipient survives that hop, so placing a message is a table lookup, not a guess:
//!
//! ```
//! use buun_mail_routing::{Envelope, Router};
//!
//! let router = Router::from_toml(r#"
//!     [[workspace]]
//!     id = "acme"
//!     name = "Acme"
//!     match = ["*@acme.com"]
//!     folders = [{ name = "Receipts", from = "*@stripe.com" }]
//! "#)?;
//!
//! let envelope = Envelope::parse("billing@stripe.com", "sales@acme.com")?;
//! let route = router.route(&envelope);
//! assert_eq!(route.workspace.as_str(), "acme");
//! assert_eq!(route.folder.map(|f| f.as_str()), Some("Receipts"));
//! # Ok::<(), Box<dyn std::error::Error>>(())
//! ```

mod address;
mod config;
mod error;
mod pattern;
mod router;

pub use address::Address;
pub use config::{Config, FolderRule, WorkspaceConfig};
pub use error::{AddressError, ConfigError};
pub use pattern::Pattern;
pub use router::{Envelope, FolderName, Route, Router, UNSORTED_NAME, UNSORTED_WORKSPACE, Workspace, WorkspaceId};
