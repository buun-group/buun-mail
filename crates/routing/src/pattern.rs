//! The two shapes a routing rule can take: one exact address, or every address at a domain.

use std::fmt;

use crate::address::Address;
use crate::error::AddressError;

/// The local part that stands for any address at a domain.
const ANY_LOCAL: &str = "*";

/// The prefix of a domain-wide pattern, such as `*@acme.com`.
const ANY_LOCAL_PREFIX: &str = "*@";

/// One routing rule's address side.
///
/// Patterns are deliberately small: an exact address or `*@domain`. Anything cleverer makes "where did this message go,
/// and why" hard to answer, and that answer is the whole point of the router.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Pattern {
    /// One address, `sales@acme.com`. A `+tag` on the incoming address is ignored when matching.
    Exact {
        /// The local part, without a tag.
        local: String,
        /// The domain.
        domain: String,
    },
    /// Every address at a domain, `*@acme.com`.
    Domain(String),
}

impl Pattern {
    /// Reads a pattern.
    ///
    /// # Errors
    ///
    /// [`AddressError`] when the text is neither an address nor `*@domain`.
    pub fn parse(raw: &str) -> Result<Self, AddressError> {
        let trimmed = raw.trim().to_lowercase();
        if let Some(domain) = trimmed.strip_prefix(ANY_LOCAL_PREFIX) {
            // Parse a stand-in address to reuse one set of domain rules.
            let address = Address::parse(&format!("any@{domain}")).map_err(|_| AddressError::BadDomain(raw.to_owned()))?;
            return Ok(Self::Domain(address.domain().to_owned()));
        }
        let address = Address::parse(&trimmed)?;
        Ok(Self::Exact { local: address.local().to_owned(), domain: address.domain().to_owned() })
    }

    /// True when the address falls under this pattern.
    #[must_use]
    pub fn matches(&self, address: &Address) -> bool {
        match self {
            Self::Exact { local, domain } => local == address.local() && domain == address.domain(),
            Self::Domain(domain) => domain == address.domain(),
        }
    }

    /// How specific the pattern is. When an exact address and its domain both match, the exact one wins.
    #[must_use]
    pub const fn specificity(&self) -> u8 {
        match self {
            Self::Exact { .. } => 2,
            Self::Domain(_) => 1,
        }
    }
}

impl fmt::Display for Pattern {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Exact { local, domain } => write!(f, "{local}@{domain}"),
            Self::Domain(domain) => write!(f, "{ANY_LOCAL}@{domain}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn address(raw: &str) -> Address {
        Address::parse(raw).unwrap_or_else(|error| unreachable!("test address {raw}: {error}"))
    }

    #[test]
    fn a_domain_pattern_matches_every_address_there() -> Result<(), AddressError> {
        let pattern = Pattern::parse("*@Acme.com")?;
        assert!(pattern.matches(&address("sales@acme.com")));
        assert!(pattern.matches(&address("anything+x@acme.com")));
        assert!(!pattern.matches(&address("sales@acme.io")));
        assert!(!pattern.matches(&address("sales@mail.acme.com")));
        Ok(())
    }

    #[test]
    fn an_exact_pattern_ignores_the_sub_address() -> Result<(), AddressError> {
        let pattern = Pattern::parse("billing@acme.com")?;
        assert!(pattern.matches(&address("billing+march@acme.com")));
        assert!(!pattern.matches(&address("sales@acme.com")));
        Ok(())
    }

    #[test]
    fn exact_is_more_specific_than_domain() -> Result<(), AddressError> {
        assert!(Pattern::parse("a@acme.com")?.specificity() > Pattern::parse("*@acme.com")?.specificity());
        Ok(())
    }

    #[test]
    fn refuses_a_bad_domain_pattern() {
        assert!(Pattern::parse("*@acme").is_err());
        assert!(Pattern::parse("*@").is_err());
    }

    #[test]
    fn prints_back_the_way_it_reads() -> Result<(), AddressError> {
        assert_eq!(Pattern::parse("*@acme.com")?.to_string(), "*@acme.com");
        assert_eq!(Pattern::parse("Sales@acme.com")?.to_string(), "sales@acme.com");
        Ok(())
    }
}
