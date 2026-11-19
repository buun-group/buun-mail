//! Times as the UI reads them: RFC 3339 in UTC.

use mail_parser::DateTime;

/// A Unix time in seconds as RFC 3339 in UTC, such as `2026-11-19T07:42:00Z`.
#[must_use]
pub fn rfc3339(unix: i64) -> String {
    DateTime::from_timestamp(unix).to_rfc3339()
}

/// An RFC 3339 time as Unix seconds, or `None` when it does not parse.
#[must_use]
pub fn unix_of(text: &str) -> Option<i64> {
    DateTime::parse_rfc3339(text.trim()).map(|time| time.to_timestamp())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_in_utc() {
        assert!(rfc3339(0).starts_with("1970-01-01T00:00:00"));
        assert_eq!(unix_of("2026-11-20T10:00:00.000Z"), Some(1_795_168_800));
        assert_eq!(unix_of("not a time"), None);
    }
}
