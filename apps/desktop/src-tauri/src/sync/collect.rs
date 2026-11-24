//! Taking in a gateway's waiting mail: the collect call (acknowledge and list in one, small messages inline), or list,
//! fetch and acknowledge for a gateway older than it. Either way every message is filed by its envelope recipient.

use super::gateway::{Collected, GatewayClient, GatewayError};
use crate::dto::MessageDto;
use crate::mailbox::Mailbox;

/// The most rounds one check runs, 50 messages each; the rest come on the next wake.
const MAX_ROUNDS: usize = 20;

/// One check of one gateway: take in every waiting message, and acknowledge each batch once it is safe here. A message
/// that cannot be read is acknowledged too, after it is logged, so one bad message never blocks the queue; the gateway
/// would only offer it again forever. Uses the collect call (two requests when mail arrives, whatever the count) unless
/// `legacy` says the gateway is too old for it, and sets `legacy` when it finds that out. Returns what arrived.
pub(super) fn collect(client: &GatewayClient, mailbox: &Mailbox, legacy: &mut bool) -> Result<Vec<MessageDto>, GatewayError> {
    let mut arrived = Vec::new();
    if !*legacy {
        match collect_rounds(client, mailbox, &mut arrived) {
            Err(GatewayError::NoCollect) => *legacy = true,
            other => return other.map(|()| arrived),
        }
    }
    legacy_rounds(client, mailbox, &mut arrived)?;
    Ok(arrived)
}

/// Collect calls until the gateway has nothing left: each call acknowledges the batch before it.
fn collect_rounds(client: &GatewayClient, mailbox: &Mailbox, arrived: &mut Vec<MessageDto>) -> Result<(), GatewayError> {
    let mut stored: Vec<String> = Vec::new();
    for _ in 0..MAX_ROUNDS {
        let batch = client.collect(&stored)?;
        if batch.is_empty() {
            return Ok(());
        }
        stored = batch.into_iter().map(|message| take_collected(client, mailbox, message, arrived)).collect::<Result<_, _>>()?;
    }
    client.acknowledge(&stored)?;
    Ok(())
}

/// Takes in one collected message, from its inline bytes or, for a large one, a fetch. Returns its id to acknowledge.
fn take_collected(client: &GatewayClient, mailbox: &Mailbox, message: Collected, arrived: &mut Vec<MessageDto>) -> Result<String, GatewayError> {
    use base64::Engine as _;
    let inline = message.raw.as_deref().and_then(|text| base64::engine::general_purpose::STANDARD.decode(text).ok());
    let raw = match inline {
        Some(bytes) => bytes,
        None => client.raw(&message.id)?,
    };
    take_one(mailbox, &raw, &message.id, &message.envelope_to, message.received_at, arrived);
    Ok(message.id)
}

/// The path for a gateway older than the collect call: list, fetch each, acknowledge, until nothing is left.
fn legacy_rounds(client: &GatewayClient, mailbox: &Mailbox, arrived: &mut Vec<MessageDto>) -> Result<(), GatewayError> {
    for _ in 0..MAX_ROUNDS {
        let waiting = client.waiting()?;
        if waiting.is_empty() {
            return Ok(());
        }
        let mut done = Vec::with_capacity(waiting.len());
        for message in waiting {
            let raw = client.raw(&message.id)?;
            take_one(mailbox, &raw, &message.id, &message.envelope_to, message.received_at, arrived);
            done.push(message.id);
        }
        client.acknowledge(&done)?;
    }
    Ok(())
}

/// Files one message by its envelope recipient; a message that cannot be read is logged and still counts as done.
fn take_one(mailbox: &Mailbox, raw: &[u8], id: &str, envelope_to: &str, received_at_ms: i64, arrived: &mut Vec<MessageDto>) {
    match mailbox.take_in(raw, envelope_to, received_at_ms / 1000) {
        Ok(Some(new)) => arrived.push(new),
        Ok(None) => {}
        Err(error) => mailbox.note_unreadable(id, &error.to_string()),
    }
}
