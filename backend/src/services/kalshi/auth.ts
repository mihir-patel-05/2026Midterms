import { constants, createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * Kalshi signs `timestamp + METHOD + path`: RSA keys with RSA-PSS/SHA-256 (salt = digest
 * length), Ed25519 keys with plain Ed25519 (no separate digest).
 */
export function signRequest(privateKey: KeyObject, method: string, path: string, timestampMs = Date.now()) {
  const timestamp = String(timestampMs);
  const message = Buffer.from(`${timestamp}${method}${path}`);
  const signature = privateKey.asymmetricKeyType === 'ed25519'
    ? sign(null, message, privateKey)
    : sign('sha256', message, {
      key: privateKey,
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
    });
  return { timestamp, signature: signature.toString('base64') };
}

export function authHeaders(keyId: string, privateKey: KeyObject, method: string, path: string): Record<string, string> {
  const { timestamp, signature } = signRequest(privateKey, method, path);
  return {
    'KALSHI-ACCESS-KEY': keyId,
    'KALSHI-ACCESS-TIMESTAMP': timestamp,
    'KALSHI-ACCESS-SIGNATURE': signature,
  };
}

/**
 * Accepts an inline PEM (literal or `\n`-escaped newlines), just the PEM's base64 body
 * on one line, or a path to a PEM file.
 */
export function loadPrivateKey(inline: string | undefined, path: string | undefined): KeyObject | null {
  const value = inline?.trim();
  if (value && !value.includes('BEGIN')) {
    return createPrivateKey({ key: Buffer.from(value.replace(/\s+/g, ''), 'base64'), format: 'der', type: 'pkcs8' });
  }
  const pem = value ? value.replace(/\\n/g, '\n') : path ? readFileSync(path, 'utf8') : null;
  return pem ? createPrivateKey(pem) : null;
}
