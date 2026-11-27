//! Secrets at rest: every key, token and password the app keeps is sealed with XChaCha20-Poly1305 under a key made once
//! for this install (`vault.key` in the config folder, readable by this user only), so the settings files hold no
//! secret in the clear, and an update never changes the key. Plain values written by an older version are sealed on
//! first start.
//!
//! - `reveal`: the optional code asked before a saved secret is shown again

pub mod reveal;
#[cfg(test)]
mod tests;

use std::path::Path;
use std::sync::OnceLock;

use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use serde_json::Value;

use crate::error::AppError;
use crate::paths::{file_error, write_private, write_private_bytes};

/// The key's file in the config folder.
const KEY_FILE: &str = "vault.key";

/// What a sealed value starts with, so a plain one from an older version is told apart.
const PREFIX: &str = "sealed:v1:";

/// The settings files that hold secrets, and the names of the fields that are secrets in them.
const FILES: &[&str] = &["senders.json", "imap.json", "gateways.json", "dissolve.json", "cryptflare.json", "agent.json", "alerts.json"];
const SECRET_FIELDS: &[&str] = &["apiKey", "password", "token", "accessToken", "refreshToken", "secret"];

static KEY: OnceLock<[u8; 32]> = OnceLock::new();

/// The install's key. Tests, which never call [`open`], get a fresh one.
fn key() -> &'static [u8; 32] {
    KEY.get_or_init(|| {
        let mut fresh = [0_u8; 32];
        let _ = getrandom::fill(&mut fresh);
        fresh
    })
}

/// Loads the install's key, making it on first start, then seals any plain secret an older version left.
///
/// # Errors
///
/// [`AppError::File`] when the key cannot be read or written, or [`AppError::Unreadable`] when it is damaged: the app
/// then refuses to start rather than make a new key and lose every secret.
pub fn open(config_folder: &Path) -> Result<(), AppError> {
    let path = config_folder.join(KEY_FILE);
    let loaded = match std::fs::read(&path) {
        Ok(bytes) => {
            let decoded =
                URL_SAFE_NO_PAD.decode(String::from_utf8_lossy(&bytes).trim()).map_err(|_| AppError::Unreadable(format!("{} is damaged", path.display())))?;
            <[u8; 32]>::try_from(decoded.as_slice()).map_err(|_| AppError::Unreadable(format!("{} is damaged", path.display())))?
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let mut fresh = [0_u8; 32];
            getrandom::fill(&mut fresh).map_err(|error| AppError::Unreadable(error.to_string()))?;
            write_private_bytes(&path, URL_SAFE_NO_PAD.encode(fresh).as_bytes())?;
            fresh
        }
        Err(source) => return Err(file_error(&path, source)),
    };
    let _ = KEY.set(loaded);
    for name in FILES {
        seal_file(&config_folder.join(name))?;
    }
    Ok(())
}

/// Seals a value.
#[must_use]
pub fn seal(plain: &str) -> String {
    let mut nonce = [0_u8; 24];
    let _ = getrandom::fill(&mut nonce);
    let cipher = XChaCha20Poly1305::new(key().into());
    let sealed = cipher.encrypt(&XNonce::from(nonce), plain.as_bytes()).unwrap_or_default();
    let mut joined = nonce.to_vec();
    joined.extend(sealed);
    format!("{PREFIX}{}", URL_SAFE_NO_PAD.encode(joined))
}

/// Opens a sealed value; a plain one (from an older version) comes back as it is. `None` when it cannot be opened,
/// such as under another install's key.
#[must_use]
pub fn unseal(stored: &str) -> Option<String> {
    let Some(body) = stored.strip_prefix(PREFIX) else { return Some(stored.to_owned()) };
    let joined = URL_SAFE_NO_PAD.decode(body).ok()?;
    if joined.len() < 24 {
        return None;
    }
    let (nonce, sealed) = joined.split_at(24);
    let plain = XChaCha20Poly1305::new(key().into()).decrypt(&XNonce::try_from(nonce).ok()?, sealed).ok()?;
    String::from_utf8(plain).ok()
}

/// Seals every secret field in a settings file that is still plain. Leaves a missing file alone.
fn seal_file(path: &Path) -> Result<(), AppError> {
    let Ok(text) = std::fs::read_to_string(path) else { return Ok(()) };
    let Ok(mut value) = serde_json::from_str::<Value>(&text) else { return Ok(()) };
    if seal_value(&mut value) {
        write_private(path, &serde_json::to_string_pretty(&value).unwrap_or_default())?;
    }
    Ok(())
}

/// Seals plain secret fields anywhere in a JSON value. True when it changed something.
fn seal_value(value: &mut Value) -> bool {
    match value {
        Value::Object(map) => {
            let mut changed = false;
            for (name, field) in map.iter_mut() {
                if let Value::String(text) = field
                    && SECRET_FIELDS.contains(&name.as_str())
                    && !text.is_empty()
                    && !text.starts_with(PREFIX)
                {
                    *text = seal(text);
                    changed = true;
                } else {
                    changed |= seal_value(field);
                }
            }
            changed
        }
        Value::Array(items) => {
            // Every item, not only up to the first that changed.
            let mut changed = false;
            for item in items {
                changed |= seal_value(item);
            }
            changed
        }
        _ => false,
    }
}

/// Serde for a secret field: written sealed, read sealed or plain. A value that cannot be opened reads as empty, so the
/// integration asks to be connected again rather than the whole file failing to load.
pub mod sealed {
    use serde::{Deserialize, Deserializer, Serializer};

    /// Writes the secret sealed.
    ///
    /// # Errors
    ///
    /// Never, beyond the serializer's own.
    pub fn serialize<S: Serializer>(plain: &str, serializer: S) -> Result<S::Ok, S::Error> {
        if plain.is_empty() { serializer.serialize_str("") } else { serializer.serialize_str(&super::seal(plain)) }
    }

    /// Reads the secret, sealed or plain.
    ///
    /// # Errors
    ///
    /// When the field is not a string.
    pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<String, D::Error> {
        let stored = String::deserialize(deserializer)?;
        Ok(super::unseal(&stored).unwrap_or_default())
    }
}
