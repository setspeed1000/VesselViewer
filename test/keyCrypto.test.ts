import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decryptApiKey, encryptApiKey, isEncryptedKey } from '../src/core/keyCrypto.js';

const KEY = '0123456789abcdef0123456789abcdef01234567';

test('encrypted key round-trips with the right passphrase', async () => {
  const blob = await encryptApiKey(KEY, 'correct horse battery');
  assert.ok(isEncryptedKey(blob));
  assert.ok(!blob.includes(KEY));
  assert.equal(await decryptApiKey(blob, 'correct horse battery'), KEY);
});

test('wrong passphrase and tampering are rejected', async () => {
  const blob = await encryptApiKey(KEY, 'correct horse battery');
  await assert.rejects(decryptApiKey(blob, 'correct horse batterz'), /Wrong passphrase/);
  const parts = blob.split('.');
  const ct = parts[4]!;
  parts[4] = (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1);
  await assert.rejects(decryptApiKey(parts.join('.'), 'correct horse battery'), /Wrong passphrase/);
  await assert.rejects(decryptApiKey('nonsense', 'x'), /Not an encrypted/);
});

test('each encryption uses a fresh salt and IV', async () => {
  const a = await encryptApiKey(KEY, 'correct horse battery');
  const b = await encryptApiKey(KEY, 'correct horse battery');
  assert.notEqual(a, b);
});

test('short passphrases are refused', async () => {
  await assert.rejects(encryptApiKey(KEY, 'short'), /at least 12/);
});
