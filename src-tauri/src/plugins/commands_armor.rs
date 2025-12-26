//! This module contains utils to encrypt and decrypt Payloads to be sent via Commands

use std::fmt::Display;

use aes_gcm::{aead::Aead, Aes128Gcm, KeyInit, Nonce};
use base64::prelude::*;
use rand::RngCore;
use serde::{de::DeserializeOwned, Serialize};
use serde_json::json;
use tracing::error;

pub(crate) enum DearmorError {
    IncorrectAesKey,
    FailedParsePayloadStructure,
    InternalAesError,
}

impl Display for DearmorError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}",
            (match self {
                DearmorError::IncorrectAesKey => "INCORRECT_AES_KEY",
                DearmorError::FailedParsePayloadStructure => "FAILED_PARSE_PAYLOAD_STRUCTURE",
                DearmorError::InternalAesError => "INTERNAL_AES_ERROR",
            })
        )
    }
}

pub(crate) fn decrypt_str<T>(key: &[u8; 16], iv: &str, payload: &str) -> Result<T, DearmorError>
where
    T: DeserializeOwned,
{
    let iv = BASE64_STANDARD_NO_PAD
        .decode(iv)
        .map_err(|_| DearmorError::FailedParsePayloadStructure)?;
    let payload = BASE64_STANDARD_NO_PAD
        .decode(payload)
        .map_err(|_| DearmorError::FailedParsePayloadStructure)?;

    decrypt(key, &iv, &payload)
}

pub(crate) fn decrypt<T>(key: &[u8; 16], iv: &[u8], payload: &[u8]) -> Result<T, DearmorError>
where
    T: DeserializeOwned,
{
    let cipher = match Aes128Gcm::new_from_slice(key) {
        Ok(x) => x,
        Err(e) => {
            error!("failed to init cipher: {e}");
            return Err(DearmorError::InternalAesError);
        }
    };
    let nonce = Nonce::from_slice(iv);
    let decrypted_bytes = cipher
        .decrypt(nonce, payload)
        .map_err(|_| DearmorError::IncorrectAesKey)?;
    serde_json::from_slice(&decrypted_bytes).map_err(|_| DearmorError::FailedParsePayloadStructure)
}

pub(crate) fn encrypt<T>(key: &[u8; 16], payload: &T) -> Result<serde_json::Value, DearmorError>
where
    T: Serialize,
{
    let cipher = match Aes128Gcm::new_from_slice(key) {
        Ok(x) => x,
        Err(e) => {
            error!("failed to init cipher: {e}");
            return Err(DearmorError::InternalAesError);
        }
    };

    // here we write a nonce / initialization vector
    // its just a random value to causes noise and makes it hard to see if the same value is sent multiple times
    // this is… absolutely overkill for our use case, but best practice for 128b AES GCM
    let mut iv = [0u8; 12];
    rand::rng().fill_bytes(&mut iv);

    let payload =
        serde_json::to_vec(payload).map_err(|_| DearmorError::FailedParsePayloadStructure)?;
    let payload_ref: &[u8] = &payload;
    let nonce = Nonce::from_slice(&iv);
    let encrypted_bytes = cipher
        .encrypt(nonce, payload_ref)
        .map_err(|_| DearmorError::IncorrectAesKey)?;
    Ok(json!({
        "iv": BASE64_STANDARD_NO_PAD.encode(nonce),
        "payload": BASE64_STANDARD_NO_PAD.encode(&encrypted_bytes),
        "success": true
    }))
}

impl From<DearmorError> for serde_json::Value {
    fn from(value: DearmorError) -> Self {
        json!({"success": false, "reason": value.to_string()})
    }
}
