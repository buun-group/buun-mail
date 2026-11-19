//! A message's id: the SHA-256 of its bytes, so the same message imported twice is stored once.

use std::fmt::Write;

use sha2::{Digest, Sha256};

/// The lowercase hex SHA-256 of a message's raw bytes.
#[must_use]
pub fn content_id(raw: &[u8]) -> String {
    Sha256::digest(raw).iter().fold(String::with_capacity(64), |mut hex, byte| {
        // Writing to a String never fails.
        let _ = write!(hex, "{byte:02x}");
        hex
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_stable_hex_of_the_bytes() {
        assert_eq!(content_id(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assert_ne!(content_id(b"abc"), content_id(b"abd"));
    }
}
