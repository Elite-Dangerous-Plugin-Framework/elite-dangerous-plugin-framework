function toB64NoPad(input: Uint8Array<ArrayBuffer>): string {
  // @ts-expect-error
  return input.toBase64({ omitPadding: true });
}

export function base64ToBytesNoPadding(b64: string) {
  // @ts-expect-error
  return Uint8Array.fromBase64(b64) as Uint8Array;
}

/**
 * This
 * 1. takes a JSON payload and stringifies it
 * 2. encodes the resulting UTF8 string to a u8 array.
 * 3. encrypts using a random vi and the provided CryptoKey using AES-GCM
 * 4. takes the resulting u8 array and converts it back to b64 (no pad)
 * 5. returns the iv and encrypted, b64-encoded payload
 */
export async function encryptPayload(root_token: CryptoKey, payload: object) {
  const te = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = te.encode(JSON.stringify(payload));

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
      },
      root_token,
      encoded,
    ),
  );
  // at this point we have the cipher as a binary blob.
  // convert to b64
  return {
    iv: toB64NoPad(iv),
    payload: toB64NoPad(ciphertext),
  };
}

/**
 * The inverse of {@link encryptPayload}. `ivStr` and `cipherStr` are both expected to be b64 encoded binary blobs without padding.
 */
export async function decryptPayload(
  root_token: CryptoKey,
  ivStr: string,
  cipherStr: string,
) {
  const iv = base64ToBytesNoPadding(ivStr) as BufferSource;
  const cipher = base64ToBytesNoPadding(cipherStr) as BufferSource;

  const cleartext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
    },
    root_token,
    cipher,
  );

  const td = new TextDecoder();
  const decoded = td.decode(cleartext);

  return JSON.parse(decoded);
}
