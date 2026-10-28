/**
 * Sites whose results are not news reporting and are dropped before ranking:
 * social and video platforms, press-release wires, official and party sites,
 * and aggregators that only re-host other outlets' stories.
 *
 * The list applies the same way to every party. Outlets are never filtered or
 * ranked by ideology (PLAN.md section 4.6). Change it by pull request.
 */
const EXCLUDED_DOMAINS = new Set([
  // Social and video
  'facebook.com', 'instagram.com', 'linkedin.com', 'reddit.com', 'threads.net', 'tiktok.com',
  'twitter.com', 'x.com', 'youtube.com', 'bsky.app', 'truthsocial.com', 'rumble.com',
  // Press-release wires
  'accesswire.com', 'businesswire.com', 'einpresswire.com', 'globenewswire.com', 'prnewswire.com', 'prweb.com',
  // Party committees
  'democrats.org', 'gop.com', 'dccc.org', 'dscc.org', 'nrcc.org', 'nrsc.org',
  // Re-hosts of other outlets' stories
  'msn.com', 'newsbreak.com',
]);

/** Official press releases (house.gov, senate.gov, whitehouse.gov) and campaign sites. */
const EXCLUDED_PATTERNS = [/(^|\.)house\.gov$/, /(^|\.)senate\.gov$/, /(^|\.)whitehouse\.gov$/, /for(congress|senate|america)\.(com|org)$/];

export function isExcludedDomain(domain: string): boolean {
  const host = domain.toLowerCase().replace(/^www\./, '');
  if (EXCLUDED_PATTERNS.some((pattern) => pattern.test(host))) return true;
  // Match the registered domain and any subdomain of it (m.facebook.com).
  const parts = host.split('.');
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (EXCLUDED_DOMAINS.has(parts.slice(index).join('.'))) return true;
  }
  return false;
}
