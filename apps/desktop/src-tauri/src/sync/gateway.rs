//! The client for the mail gateway's API. Blocking, small, and only ever run on the sync thread.

use std::time::Duration;

use serde::Deserialize;
use serde_json::json;
use thiserror::Error;
use ureq::Agent;

/// How long one call may take before the check gives up and tries again later.
const TIMEOUT: Duration = Duration::from_secs(30);

/// How many waiting messages one check asks for. The rest come on the next check.
const BATCH: u32 = 50;

/// Why a call to the gateway failed, in words for the settings screen.
#[derive(Debug, Error)]
pub enum GatewayError {
    /// The token was refused.
    #[error("the gateway refused the token; check it in Settings, Integrations")]
    Unauthorized,
    /// The gateway could not be reached or answered with an error.
    #[error("the gateway could not be reached: {0}")]
    Unreachable(String),
    /// The gateway answered with something this client does not understand.
    #[error("the gateway answered unexpectedly: {0}")]
    Protocol(String),
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
        let agent = Agent::config_builder().timeout_global(Some(TIMEOUT)).build().new_agent();
        Self { base: base.trim_end_matches('/').to_owned(), token: token.trim().to_owned(), agent }
    }

    /// The oldest waiting messages.
    ///
    /// # Errors
    ///
    /// [`GatewayError`] when the gateway refuses, cannot be reached or answers oddly.
    pub fn waiting(&self) -> Result<Vec<Waiting>, GatewayError> {
        let mut response =
            self.agent.get(format!("{}/v1/messages?limit={BATCH}", self.base)).header("Authorization", &self.bearer()).call().map_err(failure)?;
        Ok(response.body_mut().read_json::<WaitingList>().map_err(|error| GatewayError::Protocol(error.to_string()))?.messages)
    }

    /// One message's raw bytes.
    ///
    /// # Errors
    ///
    /// [`GatewayError`] as for [`GatewayClient::waiting`].
    pub fn raw(&self, id: &str) -> Result<Vec<u8>, GatewayError> {
        let mut response = self.agent.get(format!("{}/v1/messages/{id}/raw", self.base)).header("Authorization", &self.bearer()).call().map_err(failure)?;
        response.body_mut().with_config().limit(26 * 1024 * 1024).read_to_vec().map_err(|error| GatewayError::Protocol(error.to_string()))
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
        let mut response = self
            .agent
            .post(format!("{}/v1/messages/ack", self.base))
            .header("Authorization", &self.bearer())
            .send_json(json!({ "ids": ids }))
            .map_err(failure)?;
        Ok(response.body_mut().read_json::<Acknowledged>().map_err(|error| GatewayError::Protocol(error.to_string()))?.acknowledged)
    }

    fn bearer(&self) -> String {
        format!("Bearer {}", self.token)
    }
}

/// Reads a refused token apart from every other failure, so Settings can say which to fix.
fn failure(error: ureq::Error) -> GatewayError {
    match error {
        ureq::Error::StatusCode(401) => GatewayError::Unauthorized,
        other => GatewayError::Unreachable(other.to_string()),
    }
}
