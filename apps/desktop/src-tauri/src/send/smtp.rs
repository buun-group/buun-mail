//! Sending through a mail server over SMTP: Gmail or iCloud with an app password, Fastmail, Proton Bridge, or any other.
//! Blocking; run off the window's thread.

use std::time::Duration;

use lettre::address::Envelope;
use lettre::transport::smtp::authentication::Credentials;
use lettre::transport::smtp::client::{Tls, TlsParameters};
use lettre::{Address, SmtpTransport, Transport};
use serde::{Deserialize, Serialize};

use super::resend::ResendError;

/// How long connecting and each exchange may take.
const TIMEOUT: Duration = Duration::from_secs(30);

/// How the connection is protected.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Security {
    /// TLS from the first byte, usually port 465.
    Tls,
    /// A plain start upgraded with STARTTLS, usually port 587.
    StartTls,
    /// No encryption: only allowed to this computer, such as Proton Bridge.
    None,
}

/// Where and how to reach the server. The password is kept with the sender's other secret, never here.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SmtpServer {
    /// The server's name, such as `smtp.gmail.com`.
    pub host: String,
    /// Its port.
    pub port: u16,
    /// How the connection is protected.
    pub security: Security,
    /// The sign-in name, usually the full address.
    pub username: String,
}

impl SmtpServer {
    /// True when the server is this computer.
    fn is_local(&self) -> bool {
        matches!(self.host.as_str(), "127.0.0.1" | "localhost" | "::1")
    }

    fn transport(&self, password: &str) -> Result<SmtpTransport, ResendError> {
        if self.security == Security::None && !self.is_local() {
            return Err(ResendError::Refused("A server other than this computer must use TLS or STARTTLS.".to_owned()));
        }
        let tls = match self.security {
            Security::None => Tls::None,
            Security::Tls | Security::StartTls => {
                let parameters = TlsParameters::new(self.host.clone()).map_err(|error| ResendError::Refused(format!("TLS could not be set up: {error}")))?;
                if self.security == Security::Tls { Tls::Wrapper(parameters) } else { Tls::Required(parameters) }
            }
        };
        let mut builder = SmtpTransport::builder_dangerous(self.host.trim()).port(self.port).tls(tls).timeout(Some(TIMEOUT));
        if !self.username.trim().is_empty() {
            builder = builder.credentials(Credentials::new(self.username.trim().to_owned(), password.to_owned()));
        }
        Ok(builder.build())
    }

    /// Connects and signs in, to check the settings before saving them.
    ///
    /// # Errors
    ///
    /// [`ResendError`] in words: the server cannot be reached, refused the sign-in, or must use TLS.
    pub fn check(&self, password: &str) -> Result<(), ResendError> {
        match self.transport(password)?.test_connection() {
            Ok(true) => Ok(()),
            Ok(false) => Err(ResendError::Retry(format!("{} did not answer", self.host))),
            Err(error) => Err(classify(&error)),
        }
    }

    /// Sends one message's bytes to `recipients`, every To, Cc and Bcc address. The bytes must not carry a Bcc header.
    ///
    /// # Errors
    ///
    /// [`ResendError`]: a retry for a server that cannot be reached or is busy, a refusal for a bad sign-in or address.
    pub fn send(&self, password: &str, from: &str, recipients: &[String], raw: &[u8]) -> Result<(), ResendError> {
        let parse = |address: &str| address.parse::<Address>().map_err(|error| ResendError::Refused(format!("{address} is not an address: {error}")));
        let envelope = Envelope::new(Some(parse(from)?), recipients.iter().map(|address| parse(address)).collect::<Result<_, _>>()?)
            .map_err(|error| ResendError::Refused(error.to_string()))?;
        self.transport(password)?.send_raw(&envelope, raw).map(|_| ()).map_err(|error| classify(&error))
    }
}

/// A server's failure as a retry (cannot connect, busy, temporary) or a refusal (sign-in, rejected address).
fn classify(error: &lettre::transport::smtp::Error) -> ResendError {
    if error.is_permanent() {
        ResendError::Refused(format!("The mail server refused: {error}"))
    } else {
        ResendError::Retry(format!("The mail server could not take it now: {error}"))
    }
}

#[cfg(test)]
mod tests {
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};
    use std::thread;

    use super::*;

    /// A fake SMTP server on this computer that accepts one message and keeps what it was sent.
    fn fake_server() -> (u16, Arc<Mutex<String>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap_or_else(|error| unreachable!("listen: {error}"));
        let port = listener.local_addr().map_or(0, |address| address.port());
        let seen = Arc::new(Mutex::new(String::new()));
        let keep = Arc::clone(&seen);
        thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let mut writer = stream.try_clone().unwrap_or_else(|error| unreachable!("clone: {error}"));
                let mut reader = BufReader::new(stream);
                let _ = writer.write_all(b"220 fake ESMTP\r\n");
                let mut in_data = false;
                let mut line = String::new();
                while reader.read_line(&mut line).is_ok_and(|read| read > 0) {
                    if let Ok(mut text) = keep.lock() {
                        text.push_str(&line);
                    }
                    let answer: &[u8] = if in_data {
                        if line == ".\r\n" {
                            in_data = false;
                            b"250 queued\r\n"
                        } else {
                            b""
                        }
                    } else if line.starts_with("EHLO") {
                        b"250-fake\r\n250 OK\r\n"
                    } else if line.starts_with("DATA") {
                        in_data = true;
                        b"354 go on\r\n"
                    } else if line.starts_with("QUIT") {
                        let _ = writer.write_all(b"221 bye\r\n");
                        break;
                    } else if line.starts_with("RCPT TO:<nobody@") {
                        b"550 no such user\r\n"
                    } else {
                        b"250 OK\r\n"
                    };
                    let _ = writer.write_all(answer);
                    line.clear();
                }
            }
        });
        (port, seen)
    }

    #[test]
    fn sends_to_every_recipient_over_a_local_server() {
        let (port, seen) = fake_server();
        let server = SmtpServer { host: "127.0.0.1".to_owned(), port, security: Security::None, username: String::new() };
        let raw = b"From: me@acme.com\r\nTo: a@b.com\r\nSubject: Hi\r\n\r\nHello\r\n";
        let sent = server.send("", "me@acme.com", &["a@b.com".to_owned(), "hidden@b.com".to_owned()], raw);
        assert_eq!(sent, Ok(()));
        let text = seen.lock().map(|text| text.clone()).unwrap_or_default();
        assert!(text.contains("MAIL FROM:<me@acme.com>"));
        assert!(text.contains("RCPT TO:<a@b.com>") && text.contains("RCPT TO:<hidden@b.com>"));
        assert!(text.contains("Subject: Hi"));
    }

    #[test]
    fn refuses_a_rejected_address_and_plain_text_to_another_computer() {
        let (port, _) = fake_server();
        let server = SmtpServer { host: "127.0.0.1".to_owned(), port, security: Security::None, username: String::new() };
        assert!(matches!(server.send("", "me@acme.com", &["nobody@b.com".to_owned()], b"Subject: x\r\n\r\nx"), Err(ResendError::Refused(_))));
        let remote = SmtpServer { host: "smtp.example.com".to_owned(), port: 25, security: Security::None, username: String::new() };
        assert!(matches!(remote.check(""), Err(ResendError::Refused(reason)) if reason.contains("TLS")));
    }
}
