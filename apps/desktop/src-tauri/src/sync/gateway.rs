//! The client for the mail gateway's API. Blocking, small, and only ever run on the sync thread.

use std::time::Duration;

use serde::Deserialize;
use serde_json::json;
use thiserror::Error;
use ureq::Agent;

/// How long one call may take before the check gives up and tries again later.
const TIMEOUT: Duration = Duration::from_secs(30);

/// How many waiting messages one call asks for. A check keeps asking until nothing is left.
const BATCH: u32 = 50;

/// The largest collect answer read: the gateway inlines at most 8 MiB of mail, which base64 makes about 11 MiB, plus
/// the list itself.
const COLLECT_MOST_BYTES: u64 = 16 * 1024 * 1024;

/// The largest single message read from `/raw`: the gateway takes up to 25 MiB.
const RAW_MOST_BYTES: u64 = 26 * 1024 * 1024;

/// Why a call to the gateway failed, in words for the settings screen.
#[derive(Debug, Error)]
pub enum GatewayError {
    /// The token was refused.
    #[error("the gateway refused the token; check it in Settings, Integrations")]
    Unauthorized,
    /// The gateway could not be reached or answered with an error.
    #[error("the gateway could not be reached: {0}")]
    Unreachable(String),
    /// The gateway refused a change, in its own words.
    #[error("{0}")]
    Refused(String),
    /// The gateway answered with something this client does not understand.
    #[error("the gateway answered unexpectedly: {0}")]
    Protocol(String),
    /// The gateway predates `/v1/messages/collect`; the caller falls back to list, fetch and acknowledge.
    #[error("the gateway is older than the collect call")]
    NoCollect,
}

/// A waiting message from a collect, with its bytes when the gateway sent them inline.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Collected {
    /// The gateway's id for it, `mml_...`.
    pub id: String,
    /// The exact address it was delivered to.
    pub envelope_to: String,
    /// When the gateway received it, milliseconds since the epoch.
    pub received_at: i64,
    /// The message as base64, when it was small enough to come inline; otherwise fetch it with [`GatewayClient::raw`].
    pub raw: Option<String>,
}

#[derive(Deserialize)]
struct CollectAnswer {
    messages: Vec<Collected>,
}

/// A message waiting at the gateway.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Waiting {
    /// The gateway's id for it, `mml_...`.
    pub id: String,
    /// The exact address it was delivered to.
    pub envelope_to: String,
    /// When the gateway received it, milliseconds since the epoch.
    pub received_at: i64,
}

/// How a domain's mail reaches the gateway: its own account's catch-all, or a relay in another Cloudflare account.
#[derive(Debug, Clone, Copy, Deserialize, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DomainRoute {
    /// The gateway's account routes it with a catch-all the gateway manages.
    CatchAll,
    /// A relay Worker in the domain's own account hands its mail over.
    Relay,
}

/// A domain the mailbox owns, as the gateway reports it.
#[derive(Debug, Clone, Deserialize, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OwnedDomain {
    /// The domain.
    pub domain: String,
    /// How its mail reaches the gateway.
    pub via: DomainRoute,
    /// True when Cloudflare sends its mail to the gateway; `None` when the gateway cannot tell.
    pub routed_here: Option<bool>,
    /// What its catch-all did before, restored on removal.
    pub previously: Option<String>,
}

/// A domain in the gateway's Cloudflare account that no mailbox owns yet.
#[derive(Debug, Clone, Deserialize, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AvailableZone {
    /// The domain.
    pub domain: String,
    /// What its catch-all does today, such as `forward someone@gmail.com`.
    pub catch_all_now: String,
}

#[derive(Deserialize)]
struct Domains {
    domains: Vec<OwnedDomain>,
}

#[derive(Deserialize)]
struct Zones {
    zones: Vec<AvailableZone>,
}

#[derive(Deserialize)]
struct Added {
    domain: OwnedDomain,
}

#[derive(Deserialize)]
struct Refusal {
    message: String,
}

#[derive(Deserialize)]
struct WaitingList {
    messages: Vec<Waiting>,
}

#[derive(Deserialize)]
struct Acknowledged {
    acknowledged: u32,
}

/// A client for one gateway and token.
pub struct GatewayClient {
    base: String,
    token: String,
    agent: Agent,
}

impl GatewayClient {
    /// A client for the gateway at `base` (such as `https://mail-gateway.buungroup.com`).
    #[must_use]
    pub fn new(base: &str, token: &str) -> Self {
        let agent = Agent::config_builder().timeout_global(Some(TIMEOUT)).http_status_as_error(false).build().new_agent();
        Self { base: base.trim_end_matches('/').to_owned(), token: token.trim().to_owned(), agent }
    }

    /// The oldest waiting messages.
    ///
    /// # Errors
    ///
    /// [`GatewayError`] when the gateway refuses, cannot be reached or answers oddly.
    pub fn waiting(&self) -> Result<Vec<Waiting>, GatewayError> {
        let mut response = answer(self.agent.get(format!("{}/v1/messages?limit={BATCH}", self.base)).header("Authorization", &self.bearer()).call())?;
        Ok(response.body_mut().read_json::<WaitingList>().map_err(protocol)?.messages)
    }

    /// One message's raw bytes.
    ///
    /// # Errors
    ///
    /// [`GatewayError`] as for [`GatewayClient::waiting`].
    pub fn raw(&self, id: &str) -> Result<Vec<u8>, GatewayError> {
        let mut response = answer(self.agent.get(format!("{}/v1/messages/{id}/raw", self.base)).header("Authorization", &self.bearer()).call())?;
        response.body_mut().with_config().limit(RAW_MOST_BYTES).read_to_vec().map_err(protocol)
    }

    /// Tells the gateway these messages are stored here, so it forgets them. Returns how many it removed.
    ///
    /// # Errors
    ///
    /// [`GatewayError`] as for [`GatewayClient::waiting`].
    pub fn acknowledge(&self, ids: &[String]) -> Result<u32, GatewayError> {
        if ids.is_empty() {
            return Ok(0);
        }
        let mut response =
            answer(self.agent.post(format!("{}/v1/messages/ack", self.base)).header("Authorization", &self.bearer()).send_json(json!({ "ids": ids })))?;
        Ok(response.body_mut().read_json::<Acknowledged>().map_err(protocol)?.acknowledged)
    }

    /// One round trip: the gateway forgets `ack`, then returns the next waiting messages, small ones with their bytes.
    ///
    /// # Errors
    ///
    /// [`GatewayError::NoCollect`] when the gateway is too old to have the call (it answers 404), or [`GatewayError`]
    /// as for [`GatewayClient::waiting`].
    pub fn collect(&self, ack: &[String]) -> Result<Vec<Collected>, GatewayError> {
        let result = self
            .agent
            .post(format!("{}/v1/messages/collect", self.base))
            .header("Authorization", &self.bearer())
            .send_json(json!({ "ack": ack, "limit": BATCH }));
        if result.as_ref().is_ok_and(|response| response.status().as_u16() == 404) {
            return Err(GatewayError::NoCollect);
        }
        let mut response = answer(result)?;
        Ok(response.body_mut().with_config().limit(COLLECT_MOST_BYTES).read_json::<CollectAnswer>().map_err(protocol)?.messages)
    }

    /// The domains this mailbox owns.
    ///
    /// # Errors
    ///
    /// [`GatewayError`] as for [`GatewayClient::waiting`].
    pub fn domains(&self) -> Result<Vec<OwnedDomain>, GatewayError> {
        let mut response = answer(self.agent.get(format!("{}/v1/domains", self.base)).header("Authorization", &self.bearer()).call())?;
        Ok(response.body_mut().read_json::<Domains>().map_err(protocol)?.domains)
    }

    /// The domains in the gateway's Cloudflare account that could be added.
    ///
    /// # Errors
    ///
    /// The gateway's refusal in its own words, or [`GatewayError`] as for [`GatewayClient::waiting`].
    pub fn available(&self) -> Result<Vec<AvailableZone>, GatewayError> {
        let mut response = answer(self.agent.get(format!("{}/v1/domains/available", self.base)).header("Authorization", &self.bearer()).call())?;
        Ok(response.body_mut().read_json::<Zones>().map_err(protocol)?.zones)
    }

    /// Adds a domain: for a catch-all route the gateway points its Email Routing catch-all at itself; for a relay route it
    /// records the domain, and the relay in the domain's own account hands its mail over.
    ///
    /// # Errors
    ///
    /// The gateway's refusal in its own words, such as a domain outside its account, or [`GatewayError`].
    pub fn add_domain(&self, domain: &str, via: DomainRoute) -> Result<OwnedDomain, GatewayError> {
        let mut response = answer(
            self.agent.post(format!("{}/v1/domains", self.base)).header("Authorization", &self.bearer()).send_json(json!({ "domain": domain, "via": via })),
        )?;
        Ok(response.body_mut().read_json::<Added>().map_err(protocol)?.domain)
    }

    /// Removes a domain: the gateway puts its old catch-all back.
    ///
    /// # Errors
    ///
    /// The gateway's refusal in its own words, or [`GatewayError`].
    pub fn remove_domain(&self, domain: &str) -> Result<(), GatewayError> {
        answer(self.agent.delete(format!("{}/v1/domains/{domain}", self.base)).header("Authorization", &self.bearer()).call())?;
        Ok(())
    }

    fn bearer(&self) -> String {
        format!("Bearer {}", self.token)
    }
}

/// Reads a refusal's own words from the body, so Settings shows "that domain already belongs to a mailbox", not a bare
/// status code. A transport failure means the gateway could not be reached at all.
fn answer(result: Result<ureq::http::Response<ureq::Body>, ureq::Error>) -> Result<ureq::http::Response<ureq::Body>, GatewayError> {
    let mut response = result.map_err(|error| GatewayError::Unreachable(error.to_string()))?;
    if response.status().is_success() {
        return Ok(response);
    }
    if response.status().as_u16() == 401 {
        return Err(GatewayError::Unauthorized);
    }
    let status = response.status();
    let words = response.body_mut().read_json::<Refusal>().map_or_else(|_| format!("HTTP {status}"), |refusal| refusal.message);
    Err(GatewayError::Refused(words))
}

/// A body that is not what the gateway's API promises.
#[allow(clippy::needless_pass_by_value, reason = "used as a map_err function, which hands the error over by value")]
fn protocol(error: ureq::Error) -> GatewayError {
    GatewayError::Protocol(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::Refusal;

    /// The gateway in `apps/gateway` answers every refusal with this envelope; only `message` is read here.
    const ENVELOPE: &str = r#"{"error":true,"errorCode":"conflict","message":"That domain already belongs to a mailbox.","requestId":"8f00aa11bb22cc33-SYD"}"#;

    /// The envelope gateways sent before it gained `errorCode` and `requestId`, which deployed gateways may still send.
    const OLDER: &str = r#"{"error":"refused","message":"That domain already belongs to a mailbox."}"#;

    #[test]
    fn reads_the_words_of_both_refusal_shapes() -> Result<(), serde_json::Error> {
        for body in [ENVELOPE, OLDER] {
            let refusal: Refusal = serde_json::from_str(body)?;
            assert_eq!(refusal.message, "That domain already belongs to a mailbox.");
        }
        Ok(())
    }
}
