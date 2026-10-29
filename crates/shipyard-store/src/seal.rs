//! Seal a text with a passphrase (spec `work`, REQ-005, REQ-014).
//!
//! AES-256-GCM, with a key from PBKDF2-HMAC-SHA256. A sealed text is one line of ASCII:
//! `SHIPYARD-SEALED-v1:<salt>:<nonce>:<ciphertext>` in base64. It fits in a repository file and in
//! a YAML scalar (the day rate of a member).
//!
//! It stops a person who reads the file. It does not stop a person who has the passphrase, and
//! it does not rewrite history. A sealed file cannot merge.

use base64::{Engine, engine::general_purpose::STANDARD as B64};
use ring::aead::{AES_256_GCM, Aad, LessSafeKey, NONCE_LEN, Nonce, UnboundKey};
use ring::pbkdf2;
use ring::rand::{SecureRandom, SystemRandom};
use std::collections::HashMap;
use std::num::NonZeroU32;

pub const PREFIX: &str = "SHIPYARD-SEALED-v1:";
const ROUNDS: u32 = 600_000;
const SALT_LEN: usize = 16;

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum SealError {
    /// A sealed text and no passphrase on this machine.
    #[error("sealed: this machine has no passphrase")]
    Locked,
    #[error("the passphrase is empty")]
    EmptyPassphrase,
    /// The tag does not match. Nothing was changed.
    #[error("that passphrase does not open the sealed text")]
    WrongPassphrase,
    #[error("the text is not sealed")]
    NotSealed,
    #[error("the sealed text is damaged")]
    Damaged,
    #[error("this machine has no source of randomness")]
    NoRandom,
}

pub fn is_sealed(text: &str) -> bool {
    text.trim_start().starts_with(PREFIX)
}

/// One passphrase, one salt for sealing, and the keys it derived. The derivation costs a fifth of
/// a second, so a caller that handles many values (every day rate of a team) makes one `Sealer`.
pub struct Sealer {
    passphrase: String,
    salt: [u8; SALT_LEN],
    keys: HashMap<[u8; SALT_LEN], LessSafeKey>,
}

impl Sealer {
    pub fn new(passphrase: &str) -> Result<Self, SealError> {
        if passphrase.trim().is_empty() {
            return Err(SealError::EmptyPassphrase);
        }
        let mut salt = [0u8; SALT_LEN];
        SystemRandom::new()
            .fill(&mut salt)
            .map_err(|_| SealError::NoRandom)?;
        Ok(Self {
            passphrase: passphrase.into(),
            salt,
            keys: HashMap::new(),
        })
    }

    fn key(&mut self, salt: [u8; SALT_LEN]) -> &LessSafeKey {
        self.keys.entry(salt).or_insert_with(|| {
            let mut bytes = [0u8; 32];
            pbkdf2::derive(
                pbkdf2::PBKDF2_HMAC_SHA256,
                NonZeroU32::new(ROUNDS).expect("rounds"),
                &salt,
                self.passphrase.as_bytes(),
                &mut bytes,
            );
            LessSafeKey::new(UnboundKey::new(&AES_256_GCM, &bytes).expect("32 byte key"))
        })
    }

    /// A fresh nonce each time: the same text sealed twice gives two different texts.
    pub fn seal(&mut self, plaintext: &str) -> Result<String, SealError> {
        let mut nonce = [0u8; NONCE_LEN];
        SystemRandom::new()
            .fill(&mut nonce)
            .map_err(|_| SealError::NoRandom)?;
        let mut buffer = plaintext.as_bytes().to_vec();
        let salt = self.salt;
        self.key(salt)
            .seal_in_place_append_tag(
                Nonce::assume_unique_for_key(nonce),
                Aad::from(PREFIX),
                &mut buffer,
            )
            .map_err(|_| SealError::Damaged)?;
        Ok(format!(
            "{PREFIX}{}:{}:{}",
            B64.encode(salt),
            B64.encode(nonce),
            B64.encode(buffer)
        ))
    }

    pub fn open(&mut self, text: &str) -> Result<String, SealError> {
        let rest = text
            .trim()
            .strip_prefix(PREFIX)
            .ok_or(SealError::NotSealed)?;
        let mut parts = rest
            .split(':')
            .map(|p| B64.decode(p).map_err(|_| SealError::Damaged));
        let mut next = || parts.next().ok_or(SealError::Damaged)?;
        let (salt, nonce, mut buffer) = (next()?, next()?, next()?);
        let salt: [u8; SALT_LEN] = salt.try_into().map_err(|_| SealError::Damaged)?;
        let nonce: [u8; NONCE_LEN] = nonce.try_into().map_err(|_| SealError::Damaged)?;
        let opened = self
            .key(salt)
            .open_in_place(
                Nonce::assume_unique_for_key(nonce),
                Aad::from(PREFIX),
                &mut buffer,
            )
            .map_err(|_| SealError::WrongPassphrase)?;
        String::from_utf8(opened.to_vec()).map_err(|_| SealError::Damaged)
    }
}

/// Seal one text.
pub fn seal(passphrase: &str, plaintext: &str) -> Result<String, SealError> {
    Sealer::new(passphrase)?.seal(plaintext)
}

/// Open a text. A text that is not sealed passes through. A sealed text with no passphrase is
/// `Locked`: the view shows a locked state (REQ-014).
pub fn open(passphrase: Option<&str>, text: &str) -> Result<String, SealError> {
    if !is_sealed(text) {
        return Ok(text.into());
    }
    Sealer::new(passphrase.ok_or(SealError::Locked)?)?.open(text)
}
