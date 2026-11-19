//! An email address, lower-cased and split once, so every comparison after it is plain string equality.

use std::fmt;

use crate::error::AddressError;

/// The separator between the local part and the domain.
const AT: char = '@';

/// The separator a sub-address hangs off: `sales+invoices@acme.com` is delivered to `sales@acme.com`.
const SUB_ADDRESS: char = '+';

/// An address as `local@domain`, lower case, with any `+tag` kept separately so routing can ignore it.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Address {
    local: String,
    tag: Option<String>,
    domain: String,
}

impl Address {
    /// Reads an address. Surrounding space is ignored; case is folded.
    ///
    /// # Errors
    ///
    /// [`AddressError`] when there is not exactly one `@`, nothing before it, or no dotted domain after it.
    pub fn parse(raw: &str) -> Result<Self, AddressError> {
        let trimmed = raw.trim().to_lowercase();
        let mut parts = trimmed.split(AT);
        let (Some(local), Some(domain), None) = (parts.next(), parts.next(), parts.next()) else {
            return Err(AddressError::MissingAt(raw.to_owned()));
        };
        if local.is_empty() {
            return Err(AddressError::EmptyLocal(raw.to_owned()));
        }
        if !is_domain(domain) {
            return Err(AddressError::BadDomain(raw.to_owned()));
        }
        let (local, tag) = match local.split_once(SUB_ADDRESS) {
            Some((base, tag)) if !base.is_empty() => (base, Some(tag.to_owned())),
            _ => (local, None),
        };
        Ok(Self { local: local.to_owned(), tag, domain: domain.to_owned() })
    }

    /// The part before the `@`, without any `+tag`.
    #[must_use]
    pub fn local(&self) -> &str {
        &self.local
    }

    /// The `+tag`, if the address had one.
    #[must_use]
    pub fn tag(&self) -> Option<&str> {
        self.tag.as_deref()
    }

    /// The part after the `@`.
    #[must_use]
    pub fn domain(&self) -> &str {
        &self.domain
    }
}

impl fmt::Display for Address {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.tag {
            Some(tag) => write!(f, "{}{SUB_ADDRESS}{tag}{AT}{}", self.local, self.domain),
            None => write!(f, "{}{AT}{}", self.local, self.domain),
        }
    }
}

/// True for a domain with at least one dot and no empty label: `acme.com`, never `acme`, `.com` or `acme..com`.
fn is_domain(domain: &str) -> bool {
    domain.contains('.') && domain.split('.').all(|label| !label.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folds_case_and_trims() -> Result<(), AddressError> {
        let address = Address::parse("  Sales@ACME.com ")?;
        assert_eq!(address.to_string(), "sales@acme.com");
        Ok(())
    }

    #[test]
    fn keeps_the_sub_address_apart() -> Result<(), AddressError> {
        let address = Address::parse("sales+invoices@acme.com")?;
        assert_eq!(address.local(), "sales");
        assert_eq!(address.tag(), Some("invoices"));
        assert_eq!(address.to_string(), "sales+invoices@acme.com");
        Ok(())
    }

    #[test]
    fn a_leading_plus_is_part_of_the_local_part() -> Result<(), AddressError> {
        let address = Address::parse("+only@acme.com")?;
        assert_eq!(address.local(), "+only");
        assert_eq!(address.tag(), None);
        Ok(())
    }

    #[test]
    fn refuses_what_is_not_an_address() {
        assert!(matches!(Address::parse("acme.com"), Err(AddressError::MissingAt(_))));
        assert!(matches!(Address::parse("a@b@acme.com"), Err(AddressError::MissingAt(_))));
        assert!(matches!(Address::parse("@acme.com"), Err(AddressError::EmptyLocal(_))));
        assert!(matches!(Address::parse("sales@acme"), Err(AddressError::BadDomain(_))));
        assert!(matches!(Address::parse("sales@acme..com"), Err(AddressError::BadDomain(_))));
    }
}
