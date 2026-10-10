/**
 * Backend base URL, shared by every API caller.
 *
 * VITE_API_URL is often set to a bare host (e.g. "backend.up.railway.app").
 * Without a scheme, fetch() treats it as a relative path, the frontend's SPA
 * fallback answers with index.html, and JSON parsing fails on "<!doctype".
 * Add https:// when no scheme is given and drop trailing slashes.
 */
export function normalizeApiUrl(raw: string | undefined): string {
  const value = raw?.trim();
  if (!value) return 'http://localhost:3001';
  const withScheme = /^https?:\/\//i.test(value)
    ? value
    : `${/^(localhost|127\.0\.0\.1)(:|$)/.test(value) ? 'http' : 'https'}://${value}`;
  return withScheme.replace(/\/+$/, '');
}

const rawApiUrl =
  typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env.VITE_API_URL
    : typeof process !== 'undefined'
      ? process.env?.VITE_API_URL
      : undefined;

export const API_BASE_URL = normalizeApiUrl(rawApiUrl);
