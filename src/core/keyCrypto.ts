/**
 * Passphrase encryption for the aisstream API key, so an encrypted copy can be
 * built into the public site and unlocked only by people who know the passphrase.
 *
 * AES-256-GCM with a key derived by PBKDF2-HMAC-SHA256 (600,000 iterations,
 * random 16-byte salt, random 12-byte IV). Uses Web Crypto, available in
 * browsers and Node 20+.
 *
 * Format: vvk1.<iterations>.<salt>.<iv>.<ciphertext>  (base64url parts)
 */
const PREFIX = 'vvk1';
const ITERATIONS = 600_000;
export const MIN_PASSPHRASE_LENGTH = 12;

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new Error('bad encoding');
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase.normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptApiKey(apiKey: string, passphrase: string): Promise<string> {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters`);
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ITERATIONS);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(apiKey)),
  );
  return [PREFIX, String(ITERATIONS), toBase64Url(salt), toBase64Url(iv), toBase64Url(ciphertext)].join('.');
}

export function isEncryptedKey(blob: string): boolean {
  return /^vvk1\.\d+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(blob.trim());
}

/** Throws "Wrong passphrase" if the passphrase does not match. */
export async function decryptApiKey(blob: string, passphrase: string): Promise<string> {
  const parts = blob.trim().split('.');
  if (parts.length !== 5 || parts[0] !== PREFIX) throw new Error('Not an encrypted VesselViewer key');
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 10_000_000) {
    throw new Error('Not an encrypted VesselViewer key');
  }
  const salt = fromBase64Url(parts[2]!);
  const iv = fromBase64Url(parts[3]!);
  const ciphertext = fromBase64Url(parts[4]!);
  const key = await deriveKey(passphrase, salt, iterations);
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(plain);
  } catch {
    // AES-GCM authentication fails for any wrong passphrase.
    throw new Error('Wrong passphrase');
  }
}
