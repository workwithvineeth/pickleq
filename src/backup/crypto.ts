/**
 * Password encryption for backup files, using the browser's built-in Web Crypto:
 * PBKDF2-SHA-256 turns the password into a key, AES-GCM encrypts and detects tampering.
 */
export const KDF_ITERATIONS = 310_000;

export interface Envelope {
  format: 'pickleq-backup';
  v: 1;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  data: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptText(plain: string, password: string, iterations = KDF_ITERATIONS): Promise<Envelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, enc.encode(plain)));
  return {
    format: 'pickleq-backup', v: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toBase64(salt) },
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
    data: toBase64(data),
  };
}

export class BackupError extends Error {}

export function parseEnvelope(text: string): Envelope {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new BackupError('This isn’t a PICKLEQ backup file.');
  }
  const e = obj as Partial<Envelope>;
  if (e?.format !== 'pickleq-backup' || e.v !== 1 || !e.kdf?.salt || !e.cipher?.iv || !e.data) {
    throw new BackupError('This isn’t a PICKLEQ backup file.');
  }
  return e as Envelope;
}

export async function decryptText(envelope: Envelope, password: string): Promise<string> {
  const key = await deriveKey(password, fromBase64(envelope.kdf.salt), envelope.kdf.iterations);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(envelope.cipher.iv) as BufferSource },
      key,
      fromBase64(envelope.data) as BufferSource,
    );
    return dec.decode(plain);
  } catch {
    throw new BackupError('Wrong password, or the file has been changed.');
  }
}
