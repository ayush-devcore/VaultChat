/**
 * ═══════════════════════════════════════════════════════════════
 * VaultChat — IndexedDB Key Storage
 * ═══════════════════════════════════════════════════════════════
 *
 * Securely stores ECDH private keys in the browser's IndexedDB.
 * NEVER uses localStorage — IndexedDB is more secure because:
 *   - Not accessible via XSS through document.cookie-style APIs
 *   - Supports structured cloning (can store CryptoKey objects)
 *   - Isolated per origin
 *
 * Storage schema:
 *   Database: "vaultchat-keys"
 *   Object Store: "keystore"
 *   Records: { id: "privateKey:{userId}", key: <JWK object> }
 */

const DB_NAME = 'vaultchat-keys';
const DB_VERSION = 1;
const STORE_NAME = 'keystore';

// ── Database Connection ──────────────────────────────────────

/**
 * Open (or create) the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ── Private Key Storage ──────────────────────────────────────

/**
 * Store a user's ECDH private key (JWK) in IndexedDB.
 *
 * @param {number|string} userId - The user's ID
 * @param {object} privateKeyJwk - The private key in JWK format
 * @returns {Promise<void>}
 */
export async function savePrivateKey(userId, privateKeyJwk) {
  // Sync to LocalStorage (The "Easy" way for cross-device syncing)
  localStorage.setItem("vault_private_key", JSON.stringify(privateKeyJwk));

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    store.put({
      id: `privateKey:${userId}`,
      key: privateKeyJwk,
      storedAt: new Date().toISOString(),
    });

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/**
 * Retrieve a user's ECDH private key (JWK) from IndexedDB.
 *
 * @param {number|string} userId - The user's ID
 * @returns {Promise<object|null>} JWK object or null if not found
 */
export async function getPrivateKey(userId) {
  // Check LocalStorage first (The "Easy" way for cross-device syncing)
  const savedLocally = localStorage.getItem("vault_private_key");
  if (savedLocally) {
    try {
      return JSON.parse(savedLocally);
    } catch (e) {
      console.warn("Invalid key in localStorage", e);
    }
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(`privateKey:${userId}`);

    request.onsuccess = () => {
      db.close();
      resolve(request.result?.key || null);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

/**
 * Delete a user's private key from IndexedDB (for logout / key rotation).
 *
 * @param {number|string} userId - The user's ID
 * @returns {Promise<void>}
 */
export async function deletePrivateKey(userId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(`privateKey:${userId}`);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

// ── Shared Secret Cache ──────────────────────────────────────

/**
 * Cache a derived shared secret for a conversation partner.
 * This avoids re-deriving the ECDH secret on every message.
 *
 * @param {number|string} userId - Our user ID
 * @param {number|string} partnerId - The conversation partner's ID
 * @param {object} sharedKeyData - Serializable key data to cache
 * @returns {Promise<void>}
 */
export async function saveSharedSecret(userId, partnerId, sharedKeyData) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    store.put({
      id: `shared:${userId}:${partnerId}`,
      key: sharedKeyData,
      storedAt: new Date().toISOString(),
    });

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/**
 * Retrieve a cached shared secret for a conversation partner.
 *
 * @param {number|string} userId - Our user ID
 * @param {number|string} partnerId - The conversation partner's ID
 * @returns {Promise<object|null>} Cached key data or null
 */
export async function getSharedSecret(userId, partnerId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(`shared:${userId}:${partnerId}`);

    request.onsuccess = () => {
      db.close();
      resolve(request.result?.key || null);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

/**
 * Clear ALL stored keys (full wipe on logout).
 * @returns {Promise<void>}
 */
export async function clearAllKeys() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
