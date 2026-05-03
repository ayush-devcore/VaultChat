import { useState } from 'react';
import BrutalButton from '../ui/BrutalButton';
import BrutalCard from '../ui/BrutalCard';
import BrutalBadge from '../ui/BrutalBadge';
import { useAuth } from '../../context/AuthContext';
import {
  generateECDHKeyPair,
  exportPublicKey,
  importPublicKey,
  deriveSharedSecret,
  encryptMessage,
  decryptMessage,
} from '../../utils/crypto';

/**
 * CryptoDebugger — Temporary UI component to verify the cryptographic engine.
 * Demonstrates the full E2EE pipeline:
 *   1. Key generation
 *   2. Key exchange simulation
 *   3. Shared secret derivation
 *   4. AES-GCM encrypt → decrypt round-trip
 *
 * This component will be removed in Phase 4.
 */
export default function CryptoDebugger() {
  const { cryptoReady, privateKey } = useAuth();
  const [testMessage, setTestMessage] = useState('Hello from the Vault! 🔐');
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);

  const addLog = (type, message) => {
    setLogs((prev) => [...prev, { type, message, time: new Date().toLocaleTimeString() }]);
  };

  const runFullTest = async () => {
    setLogs([]);
    setRunning(true);

    try {
      // ── Step 1: Generate two key pairs (simulating two users)
      addLog('info', '🔑 Generating key pair for User A...');
      const keyPairA = await generateECDHKeyPair();
      addLog('success', '✅ User A key pair generated');

      addLog('info', '🔑 Generating key pair for User B...');
      const keyPairB = await generateECDHKeyPair();
      addLog('success', '✅ User B key pair generated');

      // ── Step 2: Export public keys (simulating server exchange)
      addLog('info', '📤 Exporting public keys to JWK...');
      const pubKeyA_jwk = await exportPublicKey(keyPairA.publicKey);
      const pubKeyB_jwk = await exportPublicKey(keyPairB.publicKey);
      addLog('success', `✅ User A public key: ${pubKeyA_jwk.substring(0, 60)}...`);
      addLog('success', `✅ User B public key: ${pubKeyB_jwk.substring(0, 60)}...`);

      // ── Step 3: Import foreign public keys
      addLog('info', '📥 Importing foreign public keys...');
      const importedPubA = await importPublicKey(pubKeyA_jwk);
      const importedPubB = await importPublicKey(pubKeyB_jwk);
      addLog('success', '✅ Foreign keys imported');

      // ── Step 4: Derive shared secrets (both sides independently)
      addLog('info', '🤝 Deriving shared secret (User A side)...');
      const sharedKeyA = await deriveSharedSecret(keyPairA.privateKey, importedPubB);
      addLog('success', '✅ User A derived shared secret');

      addLog('info', '🤝 Deriving shared secret (User B side)...');
      const sharedKeyB = await deriveSharedSecret(keyPairB.privateKey, importedPubA);
      addLog('success', '✅ User B derived shared secret');

      // ── Step 5: Encrypt with User A's key
      addLog('info', `🔒 Encrypting: "${testMessage}"`);
      const { ciphertext, iv } = await encryptMessage(sharedKeyA, testMessage);
      addLog('success', `✅ Ciphertext: ${ciphertext.substring(0, 50)}...`);
      addLog('success', `✅ IV: ${iv}`);

      // ── Step 6: Decrypt with User B's key (proves shared secret matches!)
      addLog('info', '🔓 Decrypting with User B\'s derived key...');
      const decrypted = await decryptMessage(sharedKeyB, ciphertext, iv);
      addLog('success', `✅ Decrypted: "${decrypted}"`);

      // ── Step 7: Verify
      if (decrypted === testMessage) {
        addLog('success', '🎉 E2EE ROUND-TRIP VERIFIED — Messages match!');
        addLog('success', '🛡️ The server never saw the plaintext.');
      } else {
        addLog('error', '❌ MISMATCH — decrypted text does not match original!');
      }
    } catch (err) {
      addLog('error', `❌ Error: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  const logStyles = {
    info: 'text-vault-blue',
    success: 'text-vault-green',
    error: 'text-vault-red',
  };

  return (
    <BrutalCard variant="offwhite" shadow="md" className="mt-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-black text-base uppercase flex items-center gap-2">
          ⚙ Crypto Debug Panel
          {cryptoReady ? (
            <BrutalBadge variant="green" dot>Engine Ready</BrutalBadge>
          ) : (
            <BrutalBadge variant="red" dot>Not Initialized</BrutalBadge>
          )}
        </h3>
      </div>

      {/* Status Indicators */}
      <div className="flex gap-2 flex-wrap mb-4">
        <BrutalBadge variant={privateKey ? 'green' : 'gray'}>
          Private Key: {privateKey ? 'LOADED' : 'MISSING'}
        </BrutalBadge>
        <BrutalBadge variant={cryptoReady ? 'green' : 'gray'}>
          Public Key: {cryptoReady ? 'UPLOADED' : 'PENDING'}
        </BrutalBadge>
        <BrutalBadge variant="yellow">
          ECDH P-256
        </BrutalBadge>
        <BrutalBadge variant="pink">
          AES-256-GCM
        </BrutalBadge>
      </div>

      {/* Test Message Input */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={testMessage}
          onChange={(e) => setTestMessage(e.target.value)}
          className="brutal-input focus:brutal-input-focus flex-1 text-sm"
          placeholder="Enter test message..."
          id="crypto-debug-input"
        />
        <BrutalButton
          variant="blue"
          size="sm"
          onClick={runFullTest}
          loading={running}
        >
          Run E2EE Test
        </BrutalButton>
      </div>

      {/* Log Output */}
      {logs.length > 0 && (
        <div className="bg-vault-black border-3 border-vault-black p-3 max-h-64 overflow-y-auto font-mono text-xs leading-relaxed">
          {logs.map((log, i) => (
            <div key={i} className={`${logStyles[log.type] || 'text-white'}`}>
              <span className="text-vault-gray mr-2">[{log.time}]</span>
              {log.message}
            </div>
          ))}
        </div>
      )}
    </BrutalCard>
  );
}
