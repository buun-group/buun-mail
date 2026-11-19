//! Whether a message really comes from its sender's domain, as the receiving mail server checked it: SPF, DKIM and
//! DMARC from the topmost `Authentication-Results` header (or, failing that, the first ARC one).

/// One check's result.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Check {
    /// It passed.
    Pass,
    /// It failed.
    Fail,
    /// It ran without a clear answer (`none`, `neutral`, `softfail`, `temperror` and the like).
    Other,
}

/// What the receiving server found, and an overall verdict.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Authentication {
    /// The server that checked, from the header's first field.
    pub by: Option<String>,
    /// SPF: whether the sending server may send for the domain.
    pub spf: Option<Check>,
    /// DKIM: whether the domain signed the message.
    pub dkim: Option<Check>,
    /// DMARC: whether the From domain stands behind it.
    pub dmarc: Option<Check>,
}

/// The overall reading of an [`Authentication`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    /// DMARC passed, or both SPF and DKIM did.
    Verified,
    /// DMARC failed, or both SPF and DKIM did.
    Failed,
    /// Not enough to say either way.
    Unclear,
}

impl Check {
    fn word(self) -> &'static str {
        match self {
            Self::Pass => "pass",
            Self::Fail => "fail",
            Self::Other => "other",
        }
    }

    fn from_word(word: &str) -> Option<Self> {
        match word {
            "pass" => Some(Self::Pass),
            "fail" => Some(Self::Fail),
            "other" => Some(Self::Other),
            _ => None,
        }
    }
}

impl Authentication {
    /// A one-line summary to store beside the message, such as `spf=pass dkim=pass dmarc=fail by=mx.example`, read back
    /// by [`Authentication::from_summary`]. Checks that did not run are left out.
    #[must_use]
    pub fn summary(&self) -> String {
        let checks = [("spf", self.spf), ("dkim", self.dkim), ("dmarc", self.dmarc)];
        let mut words: Vec<String> = checks.iter().filter_map(|(name, check)| check.map(|check| format!("{name}={}", check.word()))).collect();
        if let Some(by) = &self.by {
            words.push(format!("by={}", by.split_whitespace().next().unwrap_or_default()));
        }
        words.join(" ")
    }

    /// Reads a [`Authentication::summary`] back. Unknown words are skipped.
    #[must_use]
    pub fn from_summary(summary: &str) -> Self {
        let mut found = Self { by: None, spf: None, dkim: None, dmarc: None };
        for word in summary.split_whitespace() {
            let Some((name, value)) = word.split_once('=') else { continue };
            match name {
                "spf" => found.spf = Check::from_word(value),
                "dkim" => found.dkim = Check::from_word(value),
                "dmarc" => found.dmarc = Check::from_word(value),
                "by" if !value.is_empty() => found.by = Some(value.to_owned()),
                _ => {}
            }
        }
        found
    }

    /// The overall reading.
    #[must_use]
    pub fn verdict(&self) -> Verdict {
        match (self.dmarc, self.spf, self.dkim) {
            (Some(Check::Pass), _, _) | (_, Some(Check::Pass), Some(Check::Pass)) => Verdict::Verified,
            (Some(Check::Fail), _, _) | (_, Some(Check::Fail), Some(Check::Fail)) => Verdict::Failed,
            _ => Verdict::Unclear,
        }
    }
}

/// The checks the receiving server recorded, or `None` when the message carries none.
#[must_use]
pub fn authentication(raw: &[u8]) -> Option<Authentication> {
    let headers = header_block(raw);
    let value = first_header(&headers, "authentication-results").or_else(|| first_header(&headers, "arc-authentication-results"))?;
    let mut fields = value.split(';').peekable();
    // ARC results start with their instance (`i=1`); the checking server's name comes next.
    if fields.peek().is_some_and(|first| first.trim().starts_with("i=")) {
        fields.next();
    }
    let by = fields.next().and_then(|first| first.split_whitespace().next()).map(str::to_owned);
    let mut found = Authentication { by, spf: None, dkim: None, dmarc: None };
    for field in fields {
        let Some((method, rest)) = field.trim().split_once('=') else { continue };
        let result = rest.split_whitespace().next().unwrap_or_default().to_ascii_lowercase();
        let check = match result.as_str() {
            "pass" => Check::Pass,
            "fail" | "hardfail" => Check::Fail,
            _ => Check::Other,
        };
        let slot = match method.trim().to_ascii_lowercase().as_str() {
            "spf" => &mut found.spf,
            "dkim" => &mut found.dkim,
            "dmarc" => &mut found.dmarc,
            _ => continue,
        };
        // A pass from any signature counts for DKIM; otherwise the first result stands.
        if slot.is_none() || check == Check::Pass {
            *slot = Some(check);
        }
    }
    Some(found)
}

/// The header block, unfolded: each header on one line.
fn header_block(raw: &[u8]) -> Vec<String> {
    let text = String::from_utf8_lossy(raw);
    let end = text.find("\r\n\r\n").or_else(|| text.find("\n\n")).unwrap_or(text.len());
    let mut lines: Vec<String> = Vec::new();
    for line in text[..end].lines() {
        if line.starts_with([' ', '\t']) {
            if let Some(last) = lines.last_mut() {
                last.push(' ');
                last.push_str(line.trim());
            }
        } else {
            lines.push(line.to_owned());
        }
    }
    lines
}

/// The value of the topmost header called `name`.
fn first_header(lines: &[String], name: &str) -> Option<String> {
    lines.iter().find_map(|line| {
        let (key, value) = line.split_once(':')?;
        key.trim().eq_ignore_ascii_case(name).then(|| value.trim().to_owned())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_topmost_results_with_a_verdict() {
        let raw = b"Authentication-Results: mx.cloudflare.net;\r\n dkim=pass header.d=stripe.com header.s=s1;\r\n spf=pass smtp.mailfrom=stripe.com;\r\n dmarc=pass header.from=stripe.com\r\nAuthentication-Results: forged.example; dmarc=fail\r\nFrom: a@stripe.com\r\n\r\nhi";
        let found = authentication(raw).unwrap_or(Authentication { by: None, spf: None, dkim: None, dmarc: None });
        assert_eq!(found.by.as_deref(), Some("mx.cloudflare.net"));
        assert_eq!((found.spf, found.dkim, found.dmarc), (Some(Check::Pass), Some(Check::Pass), Some(Check::Pass)));
        assert_eq!(found.verdict(), Verdict::Verified);
    }

    #[test]
    fn keeps_a_summary_that_reads_back_the_same() {
        let found = authentication(b"Authentication-Results: mx.example; spf=pass; dkim=fail; dmarc=pass\r\n\r\nx").unwrap_or(Authentication {
            by: None,
            spf: None,
            dkim: None,
            dmarc: None,
        });
        assert_eq!(found.summary(), "spf=pass dkim=fail dmarc=pass by=mx.example");
        assert_eq!(Authentication::from_summary(&found.summary()), found);
        assert_eq!(Authentication::from_summary("spf=other junk"), Authentication { by: None, spf: Some(Check::Other), dkim: None, dmarc: None });
    }

    #[test]
    fn tells_a_failure_and_an_unclear_result() {
        let failed = authentication(b"Authentication-Results: mx.example; spf=softfail; dkim=none; dmarc=fail\r\n\r\nx");
        assert_eq!(failed.map(|found| found.verdict()), Some(Verdict::Failed));
        let unclear = authentication(b"ARC-Authentication-Results: i=1; mx.example; spf=neutral; dkim=none\r\n\r\nx");
        assert_eq!(unclear.as_ref().map(Authentication::verdict), Some(Verdict::Unclear));
        assert_eq!(unclear.and_then(|found| found.by), Some("mx.example".to_owned()));
        assert!(authentication(b"From: a@b.com\r\n\r\nno results").is_none());
    }
}
