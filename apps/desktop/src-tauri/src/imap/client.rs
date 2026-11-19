//! A small IMAP client: sign in, open a folder, list new message numbers, fetch a message. Only what collecting mail
//! needs, over TLS, STARTTLS, or plain text to a server on this computer (Proton Mail Bridge). Blocking.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::sync::Arc;
use std::time::Duration;

use rustls::pki_types::ServerName;
use rustls::{ClientConfig, ClientConnection, RootCertStore, StreamOwned};
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// How long connecting and each answer may take.
const TIMEOUT: Duration = Duration::from_secs(30);

/// The largest message fetched; bigger ones are skipped rather than filling memory.
const MESSAGE_LIMIT: usize = 50 * 1024 * 1024;

/// How the connection is protected.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ImapSecurity {
    /// TLS from the first byte, usually port 993.
    Tls,
    /// Plain start upgraded with STARTTLS, usually port 143.
    StartTls,
    /// No encryption: only allowed to this computer.
    None,
}

/// Why talking to the server failed, in words.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum ImapError {
    /// It could not be reached, or dropped the connection.
    #[error("the mail server could not be reached: {0}")]
    Unreachable(String),
    /// It refused the sign-in.
    #[error("the mail server refused the sign-in: {0}")]
    SignIn(String),
    /// It refused a command, or answered in a way this client does not follow.
    #[error("the mail server answered unexpectedly: {0}")]
    Protocol(String),
}

/// One untagged line of an answer, and the literal it carried, if any.
type Answer = (String, Option<Vec<u8>>);

trait Stream: Read + Write + Send {}
impl<T: Read + Write + Send> Stream for T {}

/// One open session with a server.
pub struct ImapSession {
    reader: BufReader<Box<dyn Stream>>,
    tag: u32,
}

/// What opening a folder told us.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Opened {
    /// UIDVALIDITY: when it changes, numbers seen before mean nothing.
    pub uid_validity: u32,
    /// How many messages the folder holds.
    pub exists: u32,
}

fn tls_config() -> Arc<ClientConfig> {
    let roots = RootCertStore { roots: webpki_roots::TLS_SERVER_ROOTS.to_vec() };
    Arc::new(ClientConfig::builder().with_root_certificates(roots).with_no_client_auth())
}

fn wrap_tls(host: &str, tcp: TcpStream) -> Result<Box<dyn Stream>, ImapError> {
    let name = ServerName::try_from(host.to_owned()).map_err(|error| ImapError::Unreachable(format!("{host}: {error}")))?;
    let connection = ClientConnection::new(tls_config(), name).map_err(|error| ImapError::Unreachable(error.to_string()))?;
    Ok(Box::new(StreamOwned::new(connection, tcp)))
}

/// Quotes a string for an IMAP command: backslashes and quotes escaped, line breaks refused.
fn quoted(value: &str) -> Result<String, ImapError> {
    if value.contains(['\r', '\n']) {
        return Err(ImapError::Protocol("a sign-in value cannot hold a line break".to_owned()));
    }
    Ok(format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\"")))
}

impl ImapSession {
    /// Connects and reads the greeting, upgrading with STARTTLS when asked.
    ///
    /// # Errors
    ///
    /// [`ImapError`] when the server cannot be reached, or plain text is asked for a server elsewhere.
    pub fn connect(host: &str, port: u16, security: ImapSecurity) -> Result<Self, ImapError> {
        let local = matches!(host, "127.0.0.1" | "localhost" | "::1");
        if security == ImapSecurity::None && !local {
            return Err(ImapError::SignIn("a server other than this computer must use TLS or STARTTLS".to_owned()));
        }
        let address = std::net::ToSocketAddrs::to_socket_addrs(&(host, port))
            .map_err(|error| ImapError::Unreachable(error.to_string()))?
            .next()
            .ok_or_else(|| ImapError::Unreachable(host.to_owned()))?;
        let tcp = TcpStream::connect_timeout(&address, TIMEOUT).map_err(|error| ImapError::Unreachable(error.to_string()))?;
        tcp.set_read_timeout(Some(TIMEOUT)).map_err(|error| ImapError::Unreachable(error.to_string()))?;
        tcp.set_write_timeout(Some(TIMEOUT)).map_err(|error| ImapError::Unreachable(error.to_string()))?;
        if security == ImapSecurity::StartTls {
            // The greeting and STARTTLS go over a clone of the plain socket; then the socket itself is wrapped in TLS.
            // The server says nothing more until the handshake, so nothing is left buffered in the plain reader.
            let plain_socket = tcp.try_clone().map_err(|error| ImapError::Unreachable(error.to_string()))?;
            let mut plain = Self { reader: BufReader::new(Box::new(plain_socket)), tag: 0 };
            plain.greet()?;
            plain.command("STARTTLS")?;
            return Ok(Self { reader: BufReader::new(wrap_tls(host, tcp)?), tag: plain.tag });
        }
        let stream: Box<dyn Stream> = if security == ImapSecurity::Tls { wrap_tls(host, tcp)? } else { Box::new(tcp) };
        let mut session = Self { reader: BufReader::new(stream), tag: 0 };
        session.greet()?;
        Ok(session)
    }

    /// Reads the server's greeting.
    fn greet(&mut self) -> Result<(), ImapError> {
        let greeting = self.line()?;
        if greeting.starts_with("* OK") || greeting.starts_with("* PREAUTH") { Ok(()) } else { Err(ImapError::Protocol(greeting)) }
    }

    /// Signs in with a name and password (or app password).
    ///
    /// # Errors
    ///
    /// [`ImapError::SignIn`] when refused.
    pub fn login(&mut self, user: &str, password: &str) -> Result<(), ImapError> {
        let command = format!("LOGIN {} {}", quoted(user)?, quoted(password)?);
        self.command(&command).map(|_| ()).map_err(|error| match error {
            ImapError::Protocol(said) => ImapError::SignIn(said),
            other => other,
        })
    }

    /// Opens a folder without marking anything read.
    ///
    /// # Errors
    ///
    /// [`ImapError`] when the folder cannot be opened.
    pub fn examine(&mut self, folder: &str) -> Result<Opened, ImapError> {
        let lines = self.command(&format!("EXAMINE {}", quoted(folder)?))?;
        let mut opened = Opened { uid_validity: 0, exists: 0 };
        for line in lines.iter().map(|(line, _)| line) {
            if let Some(rest) = line.split("UIDVALIDITY ").nth(1) {
                opened.uid_validity = rest.trim_end_matches([']', ' ']).split([']', ' ']).next().and_then(|value| value.parse().ok()).unwrap_or(0);
            }
            if let Some(count) = line.strip_prefix("* ").and_then(|rest| rest.strip_suffix(" EXISTS")) {
                opened.exists = count.parse().unwrap_or(0);
            }
        }
        Ok(opened)
    }

    /// The UIDs of messages after `after`, in order. Asking `n:*` always returns the newest message even when it is
    /// older than `n`, so those are dropped.
    ///
    /// # Errors
    ///
    /// [`ImapError`] when the search is refused.
    pub fn uids_after(&mut self, after: u32) -> Result<Vec<u32>, ImapError> {
        let lines = self.command(&format!("UID SEARCH UID {}:*", after.saturating_add(1)))?;
        let mut uids: Vec<u32> = lines
            .iter()
            .filter_map(|(line, _)| line.strip_prefix("* SEARCH"))
            .flat_map(|rest| rest.split_whitespace().filter_map(|value| value.parse::<u32>().ok()).collect::<Vec<_>>())
            .filter(|uid| *uid > after)
            .collect();
        uids.sort_unstable();
        Ok(uids)
    }

    /// One message's raw bytes, without marking it read; `None` when it is gone or too large.
    ///
    /// # Errors
    ///
    /// [`ImapError`] when the fetch is refused.
    pub fn fetch(&mut self, uid: u32) -> Result<Option<Vec<u8>>, ImapError> {
        let lines = self.command(&format!("UID FETCH {uid} (BODY.PEEK[])"))?;
        Ok(lines.into_iter().find_map(|(_, literal)| literal))
    }

    /// Signs out. Errors are ignored: the session is over either way.
    pub fn logout(mut self) {
        let _ = self.command("LOGOUT");
    }

    /// Sends a tagged command and reads until its tagged answer. Returns the untagged lines, each with the literal it
    /// carried, if any. A `NO` or `BAD` answer is an error with the server's words.
    fn command(&mut self, command: &str) -> Result<Vec<Answer>, ImapError> {
        self.tag += 1;
        let tag = format!("A{:04}", self.tag);
        let stream = self.reader.get_mut();
        stream.write_all(format!("{tag} {command}\r\n").as_bytes()).map_err(|error| ImapError::Unreachable(error.to_string()))?;
        stream.flush().map_err(|error| ImapError::Unreachable(error.to_string()))?;
        let mut lines = Vec::new();
        loop {
            let line = self.line()?;
            if let Some(rest) = line.strip_prefix(&format!("{tag} ")) {
                if rest.starts_with("OK") {
                    return Ok(lines);
                }
                return Err(ImapError::Protocol(rest.to_owned()));
            }
            let literal = match literal_size(&line) {
                Some(size) if size > MESSAGE_LIMIT => {
                    std::io::copy(&mut (&mut self.reader).take(size as u64), &mut std::io::sink())
                        .map_err(|error| ImapError::Unreachable(error.to_string()))?;
                    let _ = self.line();
                    None
                }
                Some(size) => {
                    let mut bytes = vec![0; size];
                    self.reader.read_exact(&mut bytes).map_err(|error| ImapError::Unreachable(error.to_string()))?;
                    // The rest of the line after the literal, usually a closing parenthesis.
                    let _ = self.line();
                    Some(bytes)
                }
                None => None,
            };
            lines.push((line, literal));
        }
    }

    /// One line from the server, without its line break.
    fn line(&mut self) -> Result<String, ImapError> {
        let mut bytes = Vec::new();
        let read = self.reader.read_until(b'\n', &mut bytes).map_err(|error| ImapError::Unreachable(error.to_string()))?;
        if read == 0 {
            return Err(ImapError::Unreachable("the server closed the connection".to_owned()));
        }
        Ok(String::from_utf8_lossy(&bytes).trim_end_matches(['\r', '\n']).to_owned())
    }
}

/// The size of a literal a line announces, `{123}` at its end.
fn literal_size(line: &str) -> Option<usize> {
    let open = line.rfind('{')?;
    line.strip_suffix('}')?.get(open + 1..)?.parse().ok()
}
