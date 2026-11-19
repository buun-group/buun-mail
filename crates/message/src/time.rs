//! Times as the UI reads them: RFC 3339 in UTC.

use mail_parser::DateTime;

/// A Unix time in seconds as RFC 3339 in UTC, such as `2026-11-19T07:42:00Z`.
#[must_use]
pub fn rfc3339(unix: i64) -> String {
    DateTime::from_timestamp(unix).to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_in_utc() {
        assert!(rfc3339(0).starts_with("1970-01-01T00:00:00"));
    }
}
