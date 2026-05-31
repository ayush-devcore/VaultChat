import { useState, useEffect, useCallback } from 'react';
import { AuthContext } from './AuthContextInstance';
import {
  generateECDHKeyPair,
  exportPublicKey,
  exportPrivateKey,
  importPrivateKey,
} from '../utils/crypto';
import { savePrivateKey, getPrivateKey, clearAllKeys } from '../utils/storage';
import { API_BASE_URL } from '../config';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cryptoReady, setCryptoReady] = useState(false);
  const [privateKey, setPrivateKey] = useState(null);

  // On mount, check for existing session and restore private key
  useEffect(() => {
    const restore = async () => {
      const storedToken = sessionStorage.getItem('vault_token');
      const storedUser = sessionStorage.getItem('vault_user');
      if (storedToken && storedUser) {
        const userData = JSON.parse(storedUser);
        setToken(storedToken);
        setUser(userData);

        // Restore private key from IndexedDB
        try {
          const storedKey = await getPrivateKey(userData.id);
          if (storedKey) {
            const importedKey = await importPrivateKey(storedKey);
            setPrivateKey(importedKey);
            setCryptoReady(true);
            console.log('🔐 Private key restored from IndexedDB');
          } else {
            console.warn('⚠️ No private key found in IndexedDB — key generation needed');
          }
        } catch (err) {
          console.error('❌ Failed to restore private key:', err);
        }
      }
      setLoading(false);
    };
    restore();
  }, []);

  /**
   * Generate ECDH key pair, save private key to IndexedDB,
   * and upload public key to the server.
   */
  const initializeCrypto = useCallback(async (userId, jwtToken) => {
    try {
      console.log('🔑 Generating ECDH P-256 key pair...');
      const keyPair = await generateECDHKeyPair();

      // Export and save private key to IndexedDB
      const privateKeyJwk = await exportPrivateKey(keyPair.privateKey);
      await savePrivateKey(userId, privateKeyJwk);
      setPrivateKey(keyPair.privateKey);
      console.log('💾 Private key saved to IndexedDB');

      // Export public key and upload to server
      const publicKeyJwk = await exportPublicKey(keyPair.publicKey);
      const res = await fetch(`${API_BASE_URL}/users/keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
        },
        body: JSON.stringify({ public_key_jwk: publicKeyJwk }),
      });

      if (!res.ok) {
        throw new Error(`Failed to upload public key: ${res.status}`);
      }

      setCryptoReady(true);
      console.log('✅ Public key uploaded to server');
      console.log('🔐 E2EE cryptographic engine initialized');

      return keyPair;
    } catch (err) {
      console.error('❌ Crypto initialization failed:', err);
      throw err;
    }
  }, []);

  const login = async (userData, jwtToken) => {
    setUser(userData);
    setToken(jwtToken);
    sessionStorage.setItem('vault_token', jwtToken);
    sessionStorage.setItem('vault_user', JSON.stringify(userData));

    // Check if we already have a private key
    const existingKey = await getPrivateKey(userData.id);
    if (existingKey) {
      try {
        const importedKey = await importPrivateKey(existingKey);
        setPrivateKey(importedKey);
        setCryptoReady(true);
        console.log('🔐 Existing private key loaded from IndexedDB');
      } catch {
        // Key is corrupted — regenerate
        console.warn('⚠️ Stored key corrupted, regenerating...');
        await initializeCrypto(userData.id, jwtToken);
      }
    } else {
      // First time — generate keys
      await initializeCrypto(userData.id, jwtToken);
    }
  };

  const logout = async () => {
    setUser(null);
    setToken(null);
    setPrivateKey(null);
    setCryptoReady(false);
    sessionStorage.removeItem('vault_token');
    sessionStorage.removeItem('vault_user');
    await clearAllKeys();
    console.log('🛑 Session cleared, all keys wiped');
  };

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!token,
    cryptoReady,
    privateKey,
    login,
    logout,
    initializeCrypto,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

