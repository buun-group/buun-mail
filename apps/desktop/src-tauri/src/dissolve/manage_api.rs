//! The `/v1` calls for managing what an account has beyond collecting mail: deleting a message there, an inbox's
//! aliases, labels on messages, and agent identities. Apart from `api.rs`, which reads mail.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};

use super::api::{Api, ApiError, checked, segment, unexpected};

/// Another address that delivers into an inbox.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Alias {
    /// Its id.
    pub id: String,
    /// The whole address.
    #[serde(rename(deserialize = "aliasAddress"))]
    pub address: String,
}

/// One of the account's labels.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct Label {
    /// Its id.
    pub id: String,
    /// Its name, unique on the account.
    pub name: String,
}

#[derive(Deserialize)]
struct Labels {
    #[serde(default)]
    labels: Vec<Label>,
}

/// An agent identity as the identity list gives it. The password is left out: the app reads it only when shown.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ListedIdentity {
    /// Its id.
    pub id: String,
    /// Its address.
    pub email: String,
    /// The inbox it lives in.
    #[serde(default)]
    pub inbox_id: Option<String>,
    /// The person's label for it.
    #[serde(default)]
    pub label: Option<String>,
    /// When it ends, RFC 3339.
    #[serde(default)]
    pub expires_at: Option<String>,
}

#[derive(Deserialize)]
struct Identities {
    #[serde(default)]
    identities: Vec<ListedIdentity>,
}

/// A list answered bare or under `key`, as dissolve.email's lists are one or the other.
fn list_of<T: for<'de> Deserialize<'de>>(value: Value, key: &str) -> Result<Vec<T>, ApiError> {
    let list = match value {
        Value::Object(mut object) => object.remove(key).unwrap_or(Value::Array(Vec::new())),
        other => other,
    };
    serde_json::from_value(list).map_err(unexpected)
}

impl Api {
    /// Deletes one message on dissolve.email. A message already gone counts as deleted.
    ///
    /// # Errors
    ///
    /// [`ApiError`] when the call fails, such as an inbox shared with the account but owned by someone else.
    pub fn delete_message(&self, inbox: &str, message: &str) -> Result<(), ApiError> {
        let url = self.url(&format!("/inboxes/{}/messages/{}", segment(inbox), segment(message)));
        match checked(self.agent.delete(url).header("Authorization", &self.bearer).call()) {
            Ok(_) | Err(ApiError::Gone) => Ok(()),
            Err(other) => Err(other),
        }
    }

    /// An inbox's aliases, newest first.
    ///
    /// # Errors
    ///
    /// [`ApiError`] when the call fails.
    pub fn aliases(&self, inbox: &str) -> Result<Vec<Alias>, ApiError> {
        let value: Value = self.get(&format!("/inboxes/{}/aliases", segment(inbox)))?.body_mut().read_json().map_err(unexpected)?;
        list_of(value, "aliases")
    }

    /// Adds an alias on the inbox's domain: `local` is the part before the `@`.
    ///
    /// # Errors
    ///
    /// [`ApiError::Refused`] or [`ApiError::Limited`] in the server's words, such as a plan without aliases or its cap.
    pub fn create_alias(&self, inbox: &str, local: &str) -> Result<Alias, ApiError> {
        let url = self.url(&format!("/inboxes/{}/aliases", segment(inbox)));
        checked(self.agent.post(url).header("Authorization", &self.bearer).send_json(json!({ "alias": local.trim().to_lowercase() })))?
            .body_mut()
            .read_json()
            .map_err(unexpected)
    }

    /// Removes an alias. One already gone counts as removed.
    ///
    /// # Errors
    ///
    /// [`ApiError`] when the call fails.
    pub fn delete_alias(&self, inbox: &str, alias: &str) -> Result<(), ApiError> {
        let url = self.url(&format!("/inboxes/{}/aliases/{}", segment(inbox), segment(alias)));
        match checked(self.agent.delete(url).header("Authorization", &self.bearer).call()) {
            Ok(_) | Err(ApiError::Gone) => Ok(()),
            Err(other) => Err(other),
        }
    }

    /// The account's labels.
    ///
    /// # Errors
    ///
    /// [`ApiError`] when the call fails, such as Free, which has none.
    pub fn labels(&self) -> Result<Vec<Label>, ApiError> {
        Ok(self.get("/labels")?.body_mut().read_json::<Labels>().map_err(unexpected)?.labels)
    }

    /// Puts a label on a message (`on`) or takes it off. Doing either twice is harmless.
    ///
    /// # Errors
    ///
    /// [`ApiError`] when the call fails.
    pub fn set_label(&self, message: &str, label: &str, on: bool) -> Result<(), ApiError> {
        let url = self.url(&format!("/messages/{}/labels/{}", segment(message), segment(label)));
        let request = if on {
            self.agent.put(url).header("Authorization", &self.bearer).send_empty()
        } else {
            self.agent.delete(url).header("Authorization", &self.bearer).call()
        };
        match checked(request) {
            Ok(_) | Err(ApiError::Gone) => Ok(()),
            Err(other) => Err(other),
        }
    }

    /// The account's live agent identities.
    ///
    /// # Errors
    ///
    /// [`ApiError`] when the call fails, such as a plan or sign-in without identities.
    pub fn identities(&self) -> Result<Vec<ListedIdentity>, ApiError> {
        Ok(self.get("/identities")?.body_mut().read_json::<Identities>().map_err(unexpected)?.identities)
    }

    /// Extends an identity by `ttl_minutes` from now (the plan's extension when `None`), relabels it, or both.
    ///
    /// # Errors
    ///
    /// [`ApiError::Refused`] in the server's words, such as past the plan's longest life.
    pub fn update_identity(&self, identity: &str, ttl_minutes: Option<i64>, label: Option<&str>) -> Result<(), ApiError> {
        let mut body = Map::new();
        if let Some(minutes) = ttl_minutes {
            body.insert("ttlMinutes".to_owned(), json!(minutes));
        }
        if let Some(label) = label {
            body.insert("label".to_owned(), json!(label.trim()));
        }
        let url = self.url(&format!("/identities/{}", segment(identity)));
        checked(self.agent.patch(url).header("Authorization", &self.bearer).send_json(Value::Object(body)))?;
        Ok(())
    }

    /// Deletes an identity, keeping its inbox and mail. One already gone counts as deleted.
    ///
    /// # Errors
    ///
    /// [`ApiError`] when the call fails.
    pub fn delete_identity(&self, identity: &str) -> Result<(), ApiError> {
        let url = self.url(&format!("/identities/{}?keepInbox=true", segment(identity)));
        match checked(self.agent.delete(url).header("Authorization", &self.bearer).call()) {
            Ok(_) | Err(ApiError::Gone) => Ok(()),
            Err(other) => Err(other),
        }
    }
}
