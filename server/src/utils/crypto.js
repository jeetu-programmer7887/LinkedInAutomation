import crypto from 'crypto';
import { tokenEncryptionKey } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
// AES-256 needs a 32-byte key; derive one from whatever string is
// configured so key length mistakes in .env can't silently break this.
const KEY = crypto.createHash('sha256').update(String(tokenEncryptionKey)).digest();

export function encrypt(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, encrypted].map((buf) => buf.toString('base64')).join('.');
}

export function decrypt(payload) {
  if (!payload) return null;
  const [ivB64, authTagB64, dataB64] = payload.split('.');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
