//! What each kind of channel sends, and where: one short message naming the mail, in the shape the service expects.

use std::time::Duration;

use serde_json::json;
use ureq::Agent;

use super::settings::{AlertChannel, AlertKind};
use crate::dto::MessageDto;
use crate::send::{ContactInput, DraftDto, SendService};

const TIMEOUT: Duration = Duration::from_secs(15);

/// The longest preview an alert carries.
const PREVIEW: usize = 280;

/// The longest text message sent.
const SMS: usize = 320;

/// Only https, or plain http to this computer, so a secret never crosses the network in the clear.
pub fn check_address(address: &str) -> Result<(), String> {
    let lowered = address.trim().to_ascii_lowercase();
    let local = ["http://localhost", "http://127.0.0.1", "http://[::1]"].iter().any(|prefix| lowered.starts_with(prefix));
    if lowered.starts_with("https://") || local { Ok(()) } else { Err("Use an https address.".to_owned()) }
}

/// What a channel needs filled in before it is saved.
pub fn check(channel: &AlertChannel) -> Result<(), String> {
    let need = |name: &str, label: &str| if channel.field(name).is_empty() { Err(format!("Fill in {label}.")) } else { Ok(()) };
    let secret = |label: &str| if channel.secret.trim().is_empty() { Err(format!("Fill in {label}.")) } else { Ok(()) };
    match channel.kind {
        AlertKind::Slack | AlertKind::Discord | AlertKind::Webhook => {
            secret("the webhook address")?;
            check_address(&channel.secret)
        }
        AlertKind::Ntfy => {
            secret("the topic")?;
            if channel.field("server").is_empty() { Ok(()) } else { check_address(channel.field("server")) }
        }
        AlertKind::Telegram => {
            secret("the bot token")?;
            need("chatId", "the chat id")
        }
        AlertKind::Email => {
            need("from", "the address it is sent from")?;
            need("to", "the address it goes to")
        }
        AlertKind::Sms => {
            secret("the auth token")?;
            need("accountSid", "the account SID")?;
            need("from", "the number it is sent from")?;
            need("to", "the number it goes to")
        }
    }
}

/// The mail in a few lines: who from, to which address, where it was filed, and how it starts.
fn lines(message: &MessageDto) -> (String, String) {
    let title = if message.subject.trim().is_empty() { "New mail".to_owned() } else { format!("New mail: {}", message.subject.trim()) };
    let place = message.folder.as_deref().map_or_else(|| message.workspace.clone(), |folder| format!("{} / {folder}", message.workspace));
    let preview: String = message.preview.chars().take(PREVIEW).collect();
    let from = if message.from_name.trim().is_empty() || message.from_name == message.from {
        message.from.clone()
    } else {
        format!("{} <{}>", message.from_name, message.from)
    };
    (title, format!("From {from}\nTo {}\nIn {place}\n\n{preview}", message.to))
}

fn agent() -> Agent {
    Agent::config_builder().timeout_global(Some(TIMEOUT)).http_status_as_error(false).build().new_agent()
}

/// The answer, or what went wrong in words.
fn answered(response: Result<ureq::http::Response<ureq::Body>, ureq::Error>, service: &str) -> Result<(), String> {
    let mut response = response.map_err(|error| format!("{service} could not be reached: {error}"))?;
    if response.status().is_success() {
        return Ok(());
    }
    let status = response.status().as_u16();
    let said: String = response.body_mut().read_to_string().unwrap_or_default().chars().take(200).collect();
    Err(format!("{service} answered HTTP {status}{}", if said.trim().is_empty() { String::new() } else { format!(": {}", said.trim()) }))
}

/// A field that can stand in for a service's own address (a self-hosted server, or a test's).
fn base(channel: &AlertChannel, default: &str) -> String {
    let given = channel.field("apiBase");
    if given.is_empty() { default.to_owned() } else { given.trim_end_matches('/').to_owned() }
}

/// Sends one alert about `message` through `channel`.
///
/// # Errors
///
/// What went wrong, in words for Settings and the activity log.
pub fn deliver(channel: &AlertChannel, message: &MessageDto, send: &SendService) -> Result<(), String> {
    let (title, body) = lines(message);
    let payload = json!({ "event": "mail.arrived", "title": title, "text": body, "message": message });
    deliver_text(channel, &title, &body, &payload, send)
}

/// Sends any alert through `channel`: a title, the text under it, and what a webhook receives.
///
/// # Errors
///
/// What went wrong, in words for Settings and the activity log.
pub fn deliver_text(channel: &AlertChannel, title: &str, body: &str, payload: &serde_json::Value, send: &SendService) -> Result<(), String> {
    let (title, body) = (title.to_owned(), body.to_owned());
    let text = format!("{title}\n{body}");
    match channel.kind {
        AlertKind::Slack => answered(agent().post(channel.secret.trim()).send_json(json!({ "text": text })), "Slack"),
        AlertKind::Discord => {
            let content: String = text.chars().take(1900).collect();
            answered(agent().post(channel.secret.trim()).send_json(json!({ "content": content })), "Discord")
        }
        AlertKind::Webhook => answered(agent().post(channel.secret.trim()).send_json(payload), "The webhook"),
        AlertKind::Ntfy => {
            let server = if channel.field("server").is_empty() { "https://ntfy.sh" } else { channel.field("server").trim_end_matches('/') };
            let title_header: String = title.chars().filter(|character| !character.is_control()).take(200).collect();
            answered(
                agent().post(format!("{server}/{}", channel.secret.trim())).header("Title", &title_header).header("Tags", "email").send(body.as_bytes()),
                "ntfy",
            )
        }
        AlertKind::Telegram => answered(
            agent()
                .post(format!("{}/bot{}/sendMessage", base(channel, "https://api.telegram.org"), channel.secret.trim()))
                .send_json(json!({ "chat_id": channel.field("chatId"), "text": text })),
            "Telegram",
        ),
        AlertKind::Sms => {
            use base64::Engine as _;
            let sid = channel.field("accountSid");
            let short: String = text.chars().take(SMS).collect();
            let auth = base64::engine::general_purpose::STANDARD.encode(format!("{sid}:{}", channel.secret.trim()));
            answered(
                agent()
                    .post(format!("{}/2010-04-01/Accounts/{sid}/Messages.json", base(channel, "https://api.twilio.com")))
                    .header("Authorization", &format!("Basic {auth}"))
                    .send_form([("To", channel.field("to")), ("From", channel.field("from")), ("Body", short.as_str())]),
                "Twilio",
            )
        }
        AlertKind::Email => {
            let draft = DraftDto {
                from: ContactInput { name: Some("Buun Mail alerts".to_owned()), address: channel.field("from").to_owned() },
                to: vec![ContactInput { name: None, address: channel.field("to").to_owned() }],
                cc: Vec::new(),
                bcc: Vec::new(),
                subject: format!("Alert: {title}"),
                text: body,
                reply_to_message: None,
                attachments: Vec::new(),
            };
            send.send(&draft).map(|_| ()).map_err(|failure| failure.message)
        }
    }
}
