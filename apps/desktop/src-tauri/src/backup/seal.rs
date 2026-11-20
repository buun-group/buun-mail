//! The sealed stream: `BUUNMAIL-BACKUP` and a version byte, a 16-byte salt and a 19-byte nonce prefix, then chunks of
//! at most 1 MiB, each a little-endian length and its XChaCha20-Poly1305 ciphertext. A chunk's nonce is the prefix, its
//! number and a last-chunk flag, and the header is bound into every chunk, so a reordered, cut or edited file fails.

use std::io::{self, Read, Write};

use argon2::Argon2;
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};

const MAGIC: &[u8; 16] = b"BUUNMAIL-BACKUP\x01";
const CHUNK: usize = 1024 * 1024;
const HEADER: usize = 16 + 16 + 19;

fn key(passphrase: &str, salt: &[u8]) -> io::Result<XChaCha20Poly1305> {
    let mut key = [0_u8; 32];
    Argon2::default().hash_password_into(passphrase.as_bytes(), salt, &mut key).map_err(|error| io::Error::other(error.to_string()))?;
    Ok(XChaCha20Poly1305::new(&key.into()))
}

fn nonce(prefix: &[u8; 19], counter: u32, last: bool) -> XNonce {
    let mut bytes = [0_u8; 24];
    bytes[..19].copy_from_slice(prefix);
    bytes[19..23].copy_from_slice(&counter.to_be_bytes());
    bytes[23] = u8::from(last);
    XNonce::from(bytes)
}

/// Writes a sealed stream to `out`. Call [`Sealer::finish`] at the end, or the file is refused when read.
pub struct Sealer<W: Write> {
    out: W,
    cipher: XChaCha20Poly1305,
    header: Vec<u8>,
    prefix: [u8; 19],
    counter: u32,
    buffer: Vec<u8>,
}

impl<W: Write> Sealer<W> {
    /// Starts a stream sealed with `passphrase`.
    ///
    /// # Errors
    ///
    /// When the system has no randomness or `out` cannot be written.
    pub fn new(mut out: W, passphrase: &str) -> io::Result<Self> {
        let mut salt = [0_u8; 16];
        let mut prefix = [0_u8; 19];
        getrandom::fill(&mut salt).map_err(|error| io::Error::other(error.to_string()))?;
        getrandom::fill(&mut prefix).map_err(|error| io::Error::other(error.to_string()))?;
        let mut header = MAGIC.to_vec();
        header.extend_from_slice(&salt);
        header.extend_from_slice(&prefix);
        out.write_all(&header)?;
        Ok(Self { out, cipher: key(passphrase, &salt)?, header, prefix, counter: 0, buffer: Vec::with_capacity(CHUNK) })
    }

    fn seal_chunk(&mut self, last: bool) -> io::Result<()> {
        let sealed = self
            .cipher
            .encrypt(&nonce(&self.prefix, self.counter, last), Payload { msg: &self.buffer, aad: &self.header })
            .map_err(|_| io::Error::other("could not seal"))?;
        let length = u32::try_from(sealed.len()).map_err(|_| io::Error::other("chunk too large"))?;
        self.out.write_all(&length.to_le_bytes())?;
        self.out.write_all(&sealed)?;
        self.counter = self.counter.checked_add(1).ok_or_else(|| io::Error::other("backup too large"))?;
        self.buffer.clear();
        Ok(())
    }

    /// Seals the last chunk and flushes. Returns the writer.
    ///
    /// # Errors
    ///
    /// When `out` cannot be written.
    pub fn finish(mut self) -> io::Result<W> {
        self.seal_chunk(true)?;
        self.out.flush()?;
        Ok(self.out)
    }
}

impl<W: Write> Write for Sealer<W> {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        let room = CHUNK - self.buffer.len();
        let taken = bytes.len().min(room);
        self.buffer.extend_from_slice(&bytes[..taken]);
        if self.buffer.len() == CHUNK {
            self.seal_chunk(false)?;
        }
        Ok(taken)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.out.flush()
    }
}

/// Reads a sealed stream, refusing a wrong passphrase, an edited, reordered or cut file.
pub struct Opener<R: Read> {
    input: R,
    cipher: XChaCha20Poly1305,
    header: Vec<u8>,
    prefix: [u8; 19],
    counter: u32,
    plain: Vec<u8>,
    at: usize,
    ended: bool,
}

impl<R: Read> Opener<R> {
    /// Opens a stream with `passphrase`.
    ///
    /// # Errors
    ///
    /// When it is not a Buun Mail backup.
    pub fn new(mut input: R, passphrase: &str) -> io::Result<Self> {
        let mut header = vec![0_u8; HEADER];
        input.read_exact(&mut header).map_err(|_| io::Error::other("This is not a Buun Mail backup."))?;
        if &header[..16] != MAGIC {
            return Err(io::Error::other("This is not a Buun Mail backup."));
        }
        let mut prefix = [0_u8; 19];
        prefix.copy_from_slice(&header[32..51]);
        let cipher = key(passphrase, &header[16..32])?;
        Ok(Self { input, cipher, header, prefix, counter: 0, plain: Vec::new(), at: 0, ended: false })
    }

    fn next_chunk(&mut self) -> io::Result<()> {
        let mut length = [0_u8; 4];
        self.input.read_exact(&mut length).map_err(|_| io::Error::other("The backup is cut short."))?;
        let length = u32::from_le_bytes(length) as usize;
        if length > CHUNK + 16 {
            return Err(io::Error::other("The backup is damaged."));
        }
        let mut sealed = vec![0_u8; length];
        self.input.read_exact(&mut sealed).map_err(|_| io::Error::other("The backup is cut short."))?;
        for last in [false, true] {
            if let Ok(plain) = self.cipher.decrypt(&nonce(&self.prefix, self.counter, last), Payload { msg: &sealed, aad: &self.header }) {
                self.plain = plain;
                self.at = 0;
                self.ended = last;
                self.counter += 1;
                return Ok(());
            }
        }
        Err(io::Error::other(if self.counter == 0 { "Wrong passphrase, or the backup is damaged." } else { "The backup is damaged." }))
    }
}

impl<R: Read> Read for Opener<R> {
    fn read(&mut self, out: &mut [u8]) -> io::Result<usize> {
        while self.at == self.plain.len() {
            if self.ended {
                return Ok(0);
            }
            self.next_chunk()?;
        }
        let taken = out.len().min(self.plain.len() - self.at);
        out[..taken].copy_from_slice(&self.plain[self.at..self.at + taken]);
        self.at += taken;
        Ok(taken)
    }
}
