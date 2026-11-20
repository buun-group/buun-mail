//! Which connected sender can send as which address, and sending a draft through it, keeping a copy in Sent.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use buun_mail_message::{Contact, Outgoing, OutgoingAttachment, build, mime_for, new_message_id, reply_references};
use serde::{Deserialize, Serialize};

use super::resend::{Domains, RESEND_API, ResendAttachment, ResendClient, ResendEmail, ResendError};
use super::settings::{self, SenderDomain, SenderKind, SenderSettings};
use super::smtp::SmtpServer;
use crate::dto::MessageDto;
use crate::error::AppError;
use crate::mailbox::{Mailbox, unix_now};

/// A connected sender as Settings shows it: never its key, only the key's last four characters.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SenderDto {
    /// Its id.
    pub id: String,
    /// What the person calls it.
    pub name: String,
    /// Which service.
    pub kind: SenderKind,
    /// The key's last four characters, to tell keys apart.
    pub key_hint: String,
    /// True for a sending-only key, whose domains were entered by hand.
    pub restricted: bool,
    /// Its domains and their state.
    pub domains: Vec<SenderDomain>,
    /// Its signature.
    pub signature: String,
    /// The mail server, for an SMTP sender; never its password.
    pub smtp: Option<SmtpServer>,
}

/// A domain mail can be sent from, and the signature its sender adds.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SendableDto {
    /// The domain.
    pub domain: String,
    /// The signature of the sender that covers it.
    pub signature: String,
}

/// A message the person wrote, as the compose window sends it.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftDto {
    /// Who it is from: an address on a domain a sender can send from.
    pub from: ContactInput,
    /// The To recipients.
    pub to: Vec<ContactInput>,
    /// The Cc recipients.
    #[serde(default)]
    pub cc: Vec<ContactInput>,
    /// The Bcc recipients.
    #[serde(default)]
    pub bcc: Vec<ContactInput>,
    /// The subject.
    pub subject: String,
    /// The text.
    pub text: String,
    /// The stored message this answers, for its thread.
    #[serde(default)]
    pub reply_to_message: Option<String>,
    /// Files to send with it: from this computer, or carried from a stored message (a forward).
    #[serde(default)]
    pub attachments: Vec<FileInput>,
}

/// A file to send: a path on this computer, or an attachment of a stored message.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileInput {
    /// Its file name, as shown and sent.
    pub name: String,
    /// A file on this computer.
    #[serde(default)]
    pub path: Option<String>,
    /// A stored message's id and the attachment's position in it.
    #[serde(default)]
    pub from_message: Option<(String, usize)>,
}

/// The most a message's files may add up to: what Resend takes, with room for the text.
const ATTACHMENTS_LIMIT: usize = 35 * 1024 * 1024;

/// An address and, optionally, a name, from the compose window.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactInput {
    /// The name, if given.
    #[serde(default)]
    pub name: Option<String>,
    /// The address.
    pub address: String,
}

/// Why a send failed, and whether trying again later may work (offline, Resend busy) or not (a refusal).
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SendFailure {
    /// True when the same message may go through later unchanged.
    pub retry: bool,
    /// What went wrong, in words.
    pub message: String,
}

impl SendFailure {
    fn refused(message: impl Into<String>) -> Self {
        Self { retry: false, message: message.into() }
    }
}

impl From<ResendError> for SendFailure {
    fn from(error: ResendError) -> Self {
        Self { retry: matches!(error, ResendError::Retry(_)), message: error.to_string() }
    }
}

impl From<AppError> for SendFailure {
    fn from(error: AppError) -> Self {
        Self::refused(error.to_string())
    }
}

struct Inner {
    config_folder: PathBuf,
    senders: Mutex<Vec<SenderSettings>>,
    mailbox: Arc<Mailbox>,
    api: String,
}

/// The senders and sending. Cheap to clone, so a send can run away from the window's thread.
#[derive(Clone)]
pub struct SendService(Arc<Inner>);

impl SendService {
    /// A sender's key or password, for showing it again once the reveal code allows.
    #[must_use]
    pub fn secret(&self, id: &str) -> Option<String> {
        self.0.senders.lock().ok()?.iter().find(|sender| sender.id == id).map(|sender| sender.api_key.clone())
    }

    /// Loads the saved senders. `api` is Resend's address, or a fake one in tests.
    #[must_use]
    pub fn open(config_folder: PathBuf, mailbox: Arc<Mailbox>) -> Self {
        Self::with_api(config_folder, mailbox, RESEND_API)
    }

    /// As [`SendService::open`], against another Resend address.
    #[must_use]
    pub fn with_api(config_folder: PathBuf, mailbox: Arc<Mailbox>, api: &str) -> Self {
        let senders = Mutex::new(settings::load(&config_folder));
        Self(Arc::new(Inner { config_folder, senders, mailbox, api: api.to_owned() }))
    }

    /// Every connected sender.
    ///
    /// # Errors
    ///
    /// [`AppError::Poisoned`] after an earlier failure.
    pub fn list(&self) -> Result<Vec<SenderDto>, AppError> {
        Ok(self.0.senders.lock()?.iter().map(dto).collect())
    }

    /// Connects a Resend key under `name`. A full-access key brings its domains with it; a sending-only key needs the
    /// domains it may send from in `entered`.
    ///
    /// # Errors
    ///
    /// The refusal in words: a bad key, Resend unreachable, or a sending-only key without domains.
    pub fn add_resend(&self, name: &str, key: &str, entered: &[String]) -> Result<Vec<SenderDto>, String> {
        let key = key.trim();
        if key.is_empty() {
            return Err("Paste the API key from Resend, under API Keys.".to_owned());
        }
        let (restricted, domains) = match ResendClient::new(&self.0.api, key).domains().map_err(|error| error.to_string())? {
            Domains::Listed(list) => (false, list.into_iter().map(|domain| SenderDomain { name: domain.name.to_lowercase(), status: domain.status }).collect()),
            Domains::Restricted => {
                let typed = clean_domains(entered);
                if typed.is_empty() {
                    return Err("This key may only send, so Resend will not list its domains. Enter the domains it may send from.".to_owned());
                }
                (true, typed.into_iter().map(|name| SenderDomain { name, status: "entered".to_owned() }).collect())
            }
        };
        let mut senders = self.0.senders.lock().map_err(|_| AppError::Poisoned.to_string())?;
        let name = if name.trim().is_empty() { "Resend".to_owned() } else { name.trim().to_owned() };
        senders.push(SenderSettings {
            id: format!("sender-{}", unix_now()),
            name,
            kind: SenderKind::Resend,
            api_key: key.to_owned(),
            smtp: None,
            restricted,
            domains,
            signature: String::new(),
        });
        settings::save(&self.0.config_folder, &senders).map_err(|error| error.to_string())?;
        Ok(senders.iter().map(dto).collect())
    }

    /// Connects a mail server under `name`: checks the sign-in first, then saves it with the domains it may send from.
    ///
    /// # Errors
    ///
    /// The refusal in words: no domains, the server cannot be reached, or the sign-in was refused.
    pub fn add_smtp(&self, name: &str, server: SmtpServer, password: &str, entered: &[String]) -> Result<Vec<SenderDto>, String> {
        let domains = clean_domains(entered);
        if domains.is_empty() {
            return Err("Enter the domains this server may send from.".to_owned());
        }
        if server.host.trim().is_empty() {
            return Err("Enter the mail server's name, such as smtp.gmail.com.".to_owned());
        }
        server.check(password).map_err(|error| error.to_string())?;
        let mut senders = self.0.senders.lock().map_err(|_| AppError::Poisoned.to_string())?;
        let name = if name.trim().is_empty() { server.host.clone() } else { name.trim().to_owned() };
        senders.push(SenderSettings {
            id: format!("sender-{}", unix_now()),
            name,
            kind: SenderKind::Smtp,
            api_key: password.to_owned(),
            smtp: Some(server),
            restricted: true,
            domains: domains.into_iter().map(|name| SenderDomain { name, status: "entered".to_owned() }).collect(),
            signature: String::new(),
        });
        settings::save(&self.0.config_folder, &senders).map_err(|error| error.to_string())?;
        Ok(senders.iter().map(dto).collect())
    }

    /// Asks Resend again for each full-access key's domains, so newly verified ones can send.
    ///
    /// # Errors
    ///
    /// The first refusal in words.
    pub fn refresh(&self) -> Result<Vec<SenderDto>, String> {
        let keys: Vec<(String, String)> = self
            .0
            .senders
            .lock()
            .map_err(|_| AppError::Poisoned.to_string())?
            .iter()
            .filter(|sender| !sender.restricted)
            .map(|sender| (sender.id.clone(), sender.api_key.clone()))
            .collect();
        let mut found = Vec::new();
        for (id, key) in keys {
            if let Domains::Listed(list) = ResendClient::new(&self.0.api, &key).domains().map_err(|error| error.to_string())? {
                found.push((id, list));
            }
        }
        let mut senders = self.0.senders.lock().map_err(|_| AppError::Poisoned.to_string())?;
        for (id, list) in found {
            if let Some(sender) = senders.iter_mut().find(|sender| sender.id == id) {
                sender.domains = list.into_iter().map(|domain| SenderDomain { name: domain.name.to_lowercase(), status: domain.status }).collect();
            }
        }
        settings::save(&self.0.config_folder, &senders).map_err(|error| error.to_string())?;
        Ok(senders.iter().map(dto).collect())
    }

    /// Changes one sender's signature, or a sending-only key's domains.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the settings cannot be saved.
    pub fn update(&self, id: &str, signature: Option<String>, domains: Option<Vec<String>>) -> Result<Vec<SenderDto>, AppError> {
        let mut senders = self.0.senders.lock()?;
        if let Some(sender) = senders.iter_mut().find(|sender| sender.id == id) {
            if let Some(signature) = signature {
                sender.signature = signature;
            }
            if let (Some(domains), true) = (domains, sender.restricted) {
                sender.domains = clean_domains(&domains).into_iter().map(|name| SenderDomain { name, status: "entered".to_owned() }).collect();
            }
        }
        settings::save(&self.0.config_folder, &senders)?;
        Ok(senders.iter().map(dto).collect())
    }

    /// Forgets one sender. Mail already sent stays in Sent.
    ///
    /// # Errors
    ///
    /// [`AppError`] when the settings cannot be saved.
    pub fn remove(&self, id: &str) -> Result<Vec<SenderDto>, AppError> {
        let mut senders = self.0.senders.lock()?;
        senders.retain(|sender| sender.id != id);
        settings::save(&self.0.config_folder, &senders)?;
        Ok(senders.iter().map(dto).collect())
    }

    /// Sends a draft through the sender that covers its From domain, then keeps a copy in Sent and returns it.
    ///
    /// # Errors
    ///
    /// [`SendFailure`]: no sender covers the domain, no recipient, or Resend refused or could not be reached.
    pub fn send(&self, draft: &DraftDto) -> Result<MessageDto, SendFailure> {
        let from = draft.from.address.trim().to_lowercase();
        let domain = from.rsplit_once('@').map(|(_, domain)| domain.to_owned()).ok_or_else(|| SendFailure::refused(format!("{from} is not an address")))?;
        let sender = self
            .0
            .senders
            .lock()
            .map_err(|_| SendFailure::refused(AppError::Poisoned.to_string()))?
            .iter()
            .find(|sender| sender.domains.iter().any(|known| known.name == domain && known.sendable()))
            .cloned()
            .ok_or_else(|| SendFailure::refused(format!("No connected sender can send from {domain} yet.")))?;
        let to = people(&draft.to);
        if to.is_empty() && draft.cc.is_empty() && draft.bcc.is_empty() {
            return Err(SendFailure::refused("Add at least one recipient."));
        }
        let answered = draft.reply_to_message.as_deref().map(|id| self.0.mailbox.thread_of(id)).transpose()?.unwrap_or_default();
        let now = unix_now();
        let mut unique = [0_u8; 12];
        getrandom::fill(&mut unique).map_err(|error| SendFailure::refused(error.to_string()))?;
        let unique: String = unique.iter().fold(String::new(), |mut hex, byte| {
            use std::fmt::Write as _;
            let _ = write!(hex, "{byte:02x}");
            hex
        });
        let attachments = self.read_files(&draft.attachments)?;
        let outgoing = Outgoing {
            from: Contact { name: draft.from.name.clone().filter(|name| !name.trim().is_empty()), address: from.clone() },
            to,
            cc: people(&draft.cc),
            bcc: people(&draft.bcc),
            reply_to: Vec::new(),
            subject: draft.subject.trim().to_owned(),
            text: draft.text.clone(),
            in_reply_to: answered.message_id.clone(),
            references: reply_references(&answered),
            message_id: new_message_id(&from, &unique),
            date: now,
            attachments,
        };
        let mut headers = BTreeMap::new();
        if let Some(id) = &outgoing.in_reply_to {
            headers.insert("In-Reply-To".to_owned(), format!("<{id}>"));
        }
        if !outgoing.references.is_empty() {
            headers.insert("References".to_owned(), outgoing.references.iter().map(|id| format!("<{id}>")).collect::<Vec<_>>().join(" "));
        }
        let email = ResendEmail {
            from: outgoing.from.name.as_ref().map_or_else(|| from.clone(), |name| format!("{} <{from}>", name.replace(['<', '>', '"'], ""))),
            to: outgoing.to.iter().map(|person| person.address.clone()).collect(),
            cc: outgoing.cc.iter().map(|person| person.address.clone()).collect(),
            bcc: outgoing.bcc.iter().map(|person| person.address.clone()).collect(),
            subject: outgoing.subject.clone(),
            text: outgoing.text.clone(),
            headers,
            attachments: outgoing
                .attachments
                .iter()
                .map(|file| {
                    use base64::Engine as _;
                    ResendAttachment { filename: file.name.clone(), content: base64::engine::general_purpose::STANDARD.encode(&file.bytes) }
                })
                .collect(),
        };
        match (sender.kind, &sender.smtp) {
            (SenderKind::Smtp, Some(server)) => {
                // What goes on the wire never names the Bcc recipients; the copy kept in Sent does.
                let wire = build(&Outgoing { bcc: Vec::new(), ..outgoing.clone() });
                let everyone: Vec<String> = outgoing.to.iter().chain(&outgoing.cc).chain(&outgoing.bcc).map(|person| person.address.clone()).collect();
                server.send(&sender.api_key, &from, &everyone, &wire)?;
            }
            (SenderKind::Smtp, None) => return Err(SendFailure::refused("This mail server's settings are missing; connect it again.")),
            (SenderKind::Resend, _) => {
                ResendClient::new(&self.0.api, &sender.api_key).send(&email, &outgoing.message_id)?;
            }
        }
        Ok(self.0.mailbox.keep_sent(&build(&outgoing), &from)?)
    }

    /// Reads each file to send, from this computer or from a stored message, keeping the total within what Resend takes.
    fn read_files(&self, files: &[FileInput]) -> Result<Vec<OutgoingAttachment>, SendFailure> {
        let mut read = Vec::with_capacity(files.len());
        let mut total = 0;
        for file in files {
            let bytes = match (&file.path, &file.from_message) {
                (Some(path), _) => std::fs::read(path).map_err(|error| SendFailure::refused(format!("{} could not be read: {error}", file.name)))?,
                (None, Some((id, index))) => {
                    let raw = self.0.mailbox.raw_of(id)?;
                    buun_mail_message::attachment(&raw, *index)
                        .map(|(_, bytes)| bytes)
                        .ok_or_else(|| SendFailure::refused(format!("{} is no longer in the message.", file.name)))?
                }
                (None, None) => continue,
            };
            total += bytes.len();
            if total > ATTACHMENTS_LIMIT {
                return Err(SendFailure::refused("The attachments add up to more than 35 MB, more than can be sent at once."));
            }
            read.push(OutgoingAttachment { mime: mime_for(&file.name).to_owned(), name: file.name.clone(), bytes });
        }
        Ok(read)
    }

    /// The domains some connected sender can send from, each with that sender's signature.
    ///
    /// # Errors
    ///
    /// [`AppError::Poisoned`] after an earlier failure.
    pub fn sendable(&self) -> Result<Vec<SendableDto>, AppError> {
        let mut found: Vec<SendableDto> = Vec::new();
        for sender in self.0.senders.lock()?.iter() {
            for domain in sender.domains.iter().filter(|domain| domain.sendable()) {
                if !found.iter().any(|known| known.domain == domain.name) {
                    found.push(SendableDto { domain: domain.name.clone(), signature: sender.signature.clone() });
                }
            }
        }
        Ok(found)
    }
}

/// A sender for the UI, without its key.
fn dto(sender: &SenderSettings) -> SenderDto {
    let hint: String = sender.api_key.chars().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect();
    SenderDto {
        id: sender.id.clone(),
        name: sender.name.clone(),
        kind: sender.kind,
        key_hint: if sender.kind == SenderKind::Smtp { String::new() } else { hint },
        restricted: sender.restricted,
        domains: sender.domains.clone(),
        signature: sender.signature.clone(),
        smtp: sender.smtp.clone(),
    }
}

/// Domains as typed: trimmed, lowercased, without `@` or a scheme, empty and repeated ones dropped.
fn clean_domains(typed: &[String]) -> Vec<String> {
    let mut clean: Vec<String> = Vec::new();
    for domain in typed {
        let domain = domain.trim().trim_start_matches("https://").trim_start_matches('@').trim_end_matches('/').to_lowercase();
        if domain.contains('.') && !clean.contains(&domain) {
            clean.push(domain);
        }
    }
    clean
}

/// Recipients from the compose window: addresses trimmed and lowercased, empty ones dropped.
fn people(list: &[ContactInput]) -> Vec<Contact> {
    list.iter()
        .filter(|person| person.address.contains('@'))
        .map(|person| Contact { name: person.name.clone().filter(|name| !name.trim().is_empty()), address: person.address.trim().to_lowercase() })
        .collect()
}

#[cfg(test)]
mod tests {
    use std::thread;

    use buun_mail_routing::Router;
    use buun_mail_store::{Placement, Store};
    use tiny_http::{Header, Response, Server};

    use super::*;
    use crate::paths::TEST_ROUTING;

    /// A fake Resend that lists flung.dev as verified and new.dev as pending, and accepts every send.
    fn fake_resend() -> String {
        let server = Server::http("127.0.0.1:0").unwrap_or_else(|error| unreachable!("fake resend: {error}"));
        let port = server.server_addr().to_ip().map_or(0, |address| address.port());
        thread::spawn(move || {
            for request in server.incoming_requests() {
                let body = if request.url() == "/domains" {
                    r#"{"data":[{"name":"flung.dev","status":"verified"},{"name":"new.dev","status":"pending"}]}"#
                } else {
                    r#"{"id":"em_1"}"#
                };
                let json = Header::from_bytes("Content-Type", "application/json").unwrap_or_else(|()| unreachable!("header"));
                let _ = request.respond(Response::from_string(body).with_header(json));
            }
        });
        format!("http://127.0.0.1:{port}")
    }

    fn contact(address: &str) -> ContactInput {
        ContactInput { name: None, address: address.to_owned() }
    }

    #[test]
    fn connects_a_key_sends_a_threaded_reply_and_keeps_it_in_sent() {
        let folder = tempfile::tempdir().unwrap_or_else(|error| unreachable!("temp: {error}"));
        let router = Router::from_toml(TEST_ROUTING).unwrap_or_else(|error| unreachable!("routing: {error}"));
        let store = Store::open(&folder.path().join("store")).unwrap_or_else(|error| unreachable!("store: {error}"));
        let mailbox = Arc::new(Mailbox::new(router, store, folder.path().join("workspaces.toml")).unwrap_or_else(|error| unreachable!("mailbox: {error}")));
        let original = b"From: A client <c@client.example>\r\nTo: hello@flung.dev\r\nSubject: Quote\r\nMessage-ID: <q1@client.example>\r\n\r\nPlease quote\r\n";
        let taken = mailbox.take_in(original, "hello@flung.dev", 1_795_000_000).ok().flatten().map(|message| message.id).unwrap_or_default();

        let notes = folder.path().join("notes.txt");
        std::fs::write(&notes, b"see attached").unwrap_or_else(|error| unreachable!("notes: {error}"));
        let service = SendService::with_api(folder.path().to_path_buf(), Arc::clone(&mailbox), &fake_resend());
        let senders = service.add_resend("Flung", "re_full_key_1234", &[]).unwrap_or_default();
        assert_eq!(senders.first().map(|sender| sender.key_hint.as_str()), Some("1234"));
        assert_eq!(service.sendable().unwrap_or_default().iter().map(|known| known.domain.as_str()).collect::<Vec<_>>(), vec!["flung.dev"]);

        let draft = DraftDto {
            from: ContactInput { name: Some("Flung".to_owned()), address: "hello@flung.dev".to_owned() },
            to: vec![contact("c@client.example")],
            cc: Vec::new(),
            bcc: Vec::new(),
            subject: "Re: Quote".to_owned(),
            text: "Here it is.".to_owned(),
            reply_to_message: Some(taken),
            attachments: vec![FileInput { name: "notes.txt".to_owned(), path: Some(notes.display().to_string()), from_message: None }],
        };
        let delivered = service.send(&draft).unwrap_or_else(|failure| unreachable!("send: {}", failure.message));
        assert_eq!((delivered.workspace.as_str(), delivered.folder.as_deref(), delivered.unread), ("flung", Some("Sent"), false));
        let kept = mailbox.messages(&Placement { workspace: "flung".to_owned(), folder: Some("Sent".to_owned()) }).unwrap_or_default();
        assert_eq!(kept.len(), 1);
        assert_eq!(
            buun_mail_message::attachments(&mailbox.raw_of(&kept[0].id).unwrap_or_default()).first().map(|file| file.name.clone()),
            Some("notes.txt".to_owned())
        );
        assert_eq!(mailbox.thread_of(&kept[0].id).ok().and_then(|ids| ids.references.first().cloned()), Some("q1@client.example".to_owned()));

        let conversation = mailbox.thread(delivered.thread_id.as_deref().unwrap_or_default()).unwrap_or_default();
        assert_eq!(conversation.iter().map(|message| message.subject.as_str()).collect::<Vec<_>>(), vec!["Quote", "Re: Quote"]);
        assert_eq!(conversation.first().map(|message| message.thread_size), Some(2));
        assert_eq!(mailbox.search_all("please quot").unwrap_or_default().len(), 1);
        assert_eq!(mailbox.search_all("quote").unwrap_or_default().len(), 2);

        let refused = service.send(&DraftDto { from: contact("hi@new.dev"), ..draft });
        assert!(matches!(refused, Err(SendFailure { retry: false, .. })));
    }
}
