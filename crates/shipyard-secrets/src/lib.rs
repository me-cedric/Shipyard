//! Secrets: a wrapper that never prints its value, and the OS keychain store.
//!
//! A secret never goes in an argument, a URL, a log or a repository file
//! (constitution 6.3). `Secret` has no `Serialize`, and its `Debug` and `Display`
//! print `***`, so a derived `Debug` on a struct that holds one cannot leak it.
//! The one way out is [`Secret::expose`]: call it only at the point of use.
//!
//! shortcut: the value is not zeroed on drop; add `zeroize` if a memory-dump threat is in scope.

use std::collections::HashMap;
use std::fmt;
use std::sync::Mutex;

const MASK: &str = "***";
const SERVICE: &str = "dev.shipyard.app";

#[derive(Clone, PartialEq, Eq)]
pub struct Secret(String);

impl Secret {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    /// The raw value. Use it only to build the request or the keychain write.
    pub fn expose(&self) -> &str {
        &self.0
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// `text` with each occurrence of this secret replaced by `***`.
    /// Pass every error text or log line that could echo a credential through it.
    pub fn scrub(&self, text: &str) -> String {
        if self.0.is_empty() {
            text.to_string()
        } else {
            text.replace(&self.0, MASK)
        }
    }
}

impl fmt::Debug for Secret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Secret({MASK})")
    }
}

impl fmt::Display for Secret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(MASK)
    }
}

impl From<String> for Secret {
    fn from(value: String) -> Self {
        Self(value)
    }
}

/// The keychain account of a connection: its `conn:<id>` ref.
pub fn conn_account(id: &str) -> String {
    format!("conn:{id}")
}

/// The message of a keychain failure. It never holds a secret value.
#[derive(Debug, thiserror::Error)]
#[error("keychain: {0}")]
pub struct SecretError(String);

impl SecretError {
    /// For a store of another crate and for tests. The text never holds a secret value.
    pub fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }
}

pub trait SecretStore: Send + Sync {
    fn get(&self, account: &str) -> Result<Option<Secret>, SecretError>;
    fn set(&self, account: &str, secret: &Secret) -> Result<(), SecretError>;
    /// Delete the secret. A missing secret is not an error.
    fn delete(&self, account: &str) -> Result<(), SecretError>;
}

/// The OS keychain: macOS Keychain, Windows Credential Manager, Secret Service.
#[derive(Debug, Default, Clone, Copy)]
pub struct Keychain;

fn entry(account: &str) -> Result<keyring::Entry, SecretError> {
    keyring::Entry::new(SERVICE, account).map_err(|e| SecretError(e.to_string()))
}

impl SecretStore for Keychain {
    fn get(&self, account: &str) -> Result<Option<Secret>, SecretError> {
        match entry(account)?.get_password() {
            Ok(value) => Ok(Some(Secret::new(value))),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(SecretError(e.to_string())),
        }
    }

    fn set(&self, account: &str, secret: &Secret) -> Result<(), SecretError> {
        entry(account)?
            .set_password(secret.expose())
            .map_err(|e| SecretError(e.to_string()))
    }

    fn delete(&self, account: &str) -> Result<(), SecretError> {
        match entry(account)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(SecretError(e.to_string())),
        }
    }
}

/// An in-memory store for tests of other crates.
#[derive(Debug, Default)]
pub struct MemoryStore(Mutex<HashMap<String, Secret>>);

impl SecretStore for MemoryStore {
    fn get(&self, account: &str) -> Result<Option<Secret>, SecretError> {
        Ok(self.0.lock().expect("store lock").get(account).cloned())
    }

    fn set(&self, account: &str, secret: &Secret) -> Result<(), SecretError> {
        self.0
            .lock()
            .expect("store lock")
            .insert(account.to_string(), secret.clone());
        Ok(())
    }

    fn delete(&self, account: &str) -> Result<(), SecretError> {
        self.0.lock().expect("store lock").remove(account);
        Ok(())
    }
}
