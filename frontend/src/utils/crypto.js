/**
 * ═══════════════════════════════════════════════════════════════
 * VaultChat — Cryptographic Engine (Web Crypto API)
 * ═══════════════════════════════════════════════════════════════
 *
 * Zero-trust E2EE implementation using native browser SubtleCrypto.
 *
 * Protocol:
 *   1. Each client generates an ECDH P-256 key pair
 *   2. Public keys are exchanged via the server (JWK format)
 *   3. A shared secret is derived client-side via ECDH
 *   4. The shared secret is used as an AES-256-GCM key
 *   5. All messages are encrypted/decrypted locally
 *
 * The server NEVER sees private keys or plaintext messages.
 */

const subtle = window.crypto.subtle;

// ── ECDH Key Pair Generation ─────────────────────────────────

/**
 * Generate an ECDH P-256 key pair for Diffie-Hellman key exchange.
 *
 * @returns {Promise<CryptoKeyPair>} { publicKey, privateKey }
 */
export async function generateECDHKeyPair() {
  const keyPair = await subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true, // extractable — needed to export public key to JWK
    ['deriveKey', 'deriveBits']
  );
  return keyPair;
}

// ── Public Key Export / Import ────────────────────────────────

/**
 * Export an ECDH public key to JWK format for transmission to the server.
 *
 * @param {CryptoKey} publicKey - The public key to export
 * @returns {Promise<string>} JSON string of the JWK
 */
export async function exportPublicKey(publicKey) {
  const jwk = await subtle.exportKey('jwk', publicKey);
  return JSON.stringify(jwk);
}

/**
 * Import a foreign ECDH public key from JWK format (received from server).
 *
 * @param {string} jwkString - JSON string of the JWK public key
 * @returns {Promise<CryptoKey>} Imported CryptoKey for key derivation
 */
export async function importPublicKey(jwkString) {
  const jwk = typeof jwkString === 'string' ? JSON.parse(jwkString) : jwkString;
  const key = await subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    []
  );
  return key;
}

/**
 * Export a private key to JWK format for IndexedDB storage.
 *
 * @param {CryptoKey} privateKey - The private key to export
 * @returns {Promise<object>} JWK object
 */
export async function exportPrivateKey(privateKey) {
  return await subtle.exportKey('jwk', privateKey);
}

/**
 * Import a private key from JWK format (loaded from IndexedDB).
 *
 * @param {object} jwk - JWK object of the private key
 * @returns {Promise<CryptoKey>} Imported CryptoKey
 */
export async function importPrivateKey(jwk) {
  return await subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    ['deriveKey', 'deriveBits']
  );
}

// ── ECDH Shared Secret Derivation ────────────────────────────

/**
 * Derive a shared AES-256-GCM key from our private key and their public key.
 * This is the core of the Diffie-Hellman key exchange — both parties
 * independently derive the SAME shared secret without transmitting it.
 *
 * @param {CryptoKey} privateKey - Our ECDH private key
 * @param {CryptoKey} foreignPublicKey - Their ECDH public key
 * @returns {Promise<CryptoKey>} AES-256-GCM shared secret key
 */
export async function deriveSharedSecret(privateKey, foreignPublicKey) {
  const sharedKey = await subtle.deriveKey(
    {
      name: 'ECDH',
      public: foreignPublicKey,
    },
    privateKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false, // not extractable — the shared secret never leaves the browser
    ['encrypt', 'decrypt']
  );
  return sharedKey;
}

// ── AES-GCM Encryption / Decryption ─────────────────────────

/**
 * Encrypt a plaintext message using AES-256-GCM.
 * Generates a cryptographically random 12-byte IV for each message.
 *
 * @param {CryptoKey} sharedKey - AES-256-GCM shared secret
 * @param {string} plaintext - The message to encrypt
 * @returns {Promise<{ ciphertext: string, iv: string }>} Base64-encoded ciphertext + IV
 */
export async function encryptMessage(sharedKey, plaintext) {
  // Generate a random 12-byte IV (NIST recommendation for AES-GCM)
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  // Encode the plaintext to bytes
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  // Encrypt with AES-256-GCM
  const encrypted = await subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    sharedKey,
    data
  );

  // Convert to Base64 for safe transport over JSON/WebSocket
  return {
    ciphertext: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv),
  };
}

/**
 * Decrypt a ciphertext message using AES-256-GCM.
 *
 * @param {CryptoKey} sharedKey - AES-256-GCM shared secret
 * @param {string} ciphertext - Base64-encoded ciphertext
 * @param {string} iv - Base64-encoded initialization vector
 * @returns {Promise<string>} Decrypted plaintext
 */
export async function decryptMessage(sharedKey, ciphertext, iv) {
  const encryptedData = base64ToArrayBuffer(ciphertext);
  const ivBytes = base64ToArrayBuffer(iv);

  const decrypted = await subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivBytes,
    },
    sharedKey,
    encryptedData
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

// ── Binary Encryption (for media files) ──────────────────────

/**
 * Encrypt a binary ArrayBuffer using AES-256-GCM.
 * Used for images, documents, and other binary media.
 *
 * @param {CryptoKey} sharedKey - AES-256-GCM shared secret
 * @param {ArrayBuffer} buffer - Raw binary data to encrypt
 * @returns {Promise<{ ciphertext: string, iv: string }>} Base64-encoded
 */
export async function encryptBinary(sharedKey, buffer) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    buffer
  );

  return {
    ciphertext: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv),
  };
}

/**
 * Decrypt a binary payload back to an ArrayBuffer.
 * Used to reconstruct images/documents after decryption.
 *
 * @param {CryptoKey} sharedKey - AES-256-GCM shared secret
 * @param {string} ciphertext - Base64-encoded ciphertext
 * @param {string} iv - Base64-encoded initialization vector
 * @returns {Promise<ArrayBuffer>} Decrypted binary data
 */
export async function decryptBinary(sharedKey, ciphertext, iv) {
  const encryptedData = base64ToArrayBuffer(ciphertext);
  const ivBytes = base64ToArrayBuffer(iv);

  return await subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    sharedKey,
    encryptedData
  );
}

// ── Utility: Base64 ↔ ArrayBuffer ────────────────────────────

/**
 * Convert an ArrayBuffer to a Base64 string.
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert a Base64 string to an ArrayBuffer.
 * @param {string} base64
 * @returns {ArrayBuffer}
 */
export function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

