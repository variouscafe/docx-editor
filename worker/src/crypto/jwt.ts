import { b64url, b64urlDecode, fromUtf8, utf8 } from './base64.js';

// HS256 JWT sign/verify via Web Crypto. HMAC-SHA256 over
// `base64url(header).base64url(payload)` keyed by the UTF-8 bytes of the secret.

export interface JwtPayload {
  sub: string; // user id
  email?: string;
  name?: string | null;
  type?: 'access' | 'refresh';
  [k: string]: unknown;
}

async function hmacKey(secret: string, usage: ('sign' | 'verify')[]): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usage);
}

export async function signJwt(payload: JwtPayload, secret: string, ttlSec: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const full = { ...payload, iat: now, exp: now + ttlSec };
  const header = b64url(utf8(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(utf8(JSON.stringify(full)));
  const data = `${header}.${body}`;
  const key = await hmacKey(secret, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, utf8(data));
  return `${data}.${b64url(sig)}`;
}

export async function verifyJwt(
  token: string,
  secret: string,
): Promise<(JwtPayload & { iat: number; exp: number }) | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts as [string, string, string];
  const data = `${header}.${body}`;
  const key = await hmacKey(secret, ['verify']);
  const ok = await crypto.subtle.verify('HMAC', key, b64urlDecode(sig), utf8(data));
  if (!ok) return null;
  const payload = JSON.parse(fromUtf8(b64urlDecode(body))) as JwtPayload & { iat: number; exp: number };
  if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}
