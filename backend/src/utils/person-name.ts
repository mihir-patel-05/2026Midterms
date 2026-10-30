const SUFFIXES = new Set(['JR', 'SR', 'II', 'III', 'IV', 'V']);
const TITLES = new Set(['MR', 'MRS', 'MS', 'DR', 'HON', 'REV']);

/**
 * Upper-case surname and first name from a ballot name ("Doris Matsui", "Alexandria
 * Ocasio-Cortez") or an FEC name ("MATSUI, DORIS O", "VAN HOLLEN, CHRIS JR."). The surname
 * key is its last word, so "Van Hollen" and "HOLLEN" compare equal. Nicknames in quotes or
 * parentheses and accents are dropped.
 */
export function nameParts(name: string): { last: string; first: string } | null {
  const clean = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/"[^"]*"|“[^”]*”|\([^)]*\)/g, ' ')
    .replace(/\./g, ' ')
    .toUpperCase();
  const words = (text: string) => text.split(/\s+/).filter((word) => word && !SUFFIXES.has(word) && !TITLES.has(word));
  const comma = clean.indexOf(',');
  let surname: string[];
  let given: string[];
  if (comma >= 0) {
    surname = words(clean.slice(0, comma));
    given = words(clean.slice(comma + 1).replace(/,/g, ' '));
  } else {
    const all = words(clean.replace(/,/g, ' '));
    surname = all.slice(-1);
    given = all.slice(0, -1);
  }
  const last = surname.at(-1)?.replace(/[^A-Z'-]/g, '');
  if (!last) return null;
  return { last, first: given[0]?.replace(/[^A-Z'-]/g, '') ?? '' };
}

/**
 * The one candidate with this name: same surname, and the same first initial when two
 * share a surname. Null when nobody matches or the match is ambiguous.
 */
export function matchName<T extends { name: string }>(name: string, candidates: readonly T[]): T | null {
  const target = nameParts(name);
  if (!target) return null;
  const sameLast = candidates.filter((candidate) => nameParts(candidate.name)?.last === target.last);
  if (sameLast.length <= 1) return sameLast[0] ?? null;
  const sameFirst = sameLast.filter((candidate) => {
    const first = nameParts(candidate.name)?.first ?? '';
    return Boolean(first && target.first && first[0] === target.first[0]);
  });
  return sameFirst.length === 1 ? sameFirst[0] : null;
}

/** D or R from a party name or FEC code ("DEM", "Democratic", "Democratic-Farmer-Labor"); null for anyone else. */
export function majorParty(party: string | null | undefined): 'D' | 'R' | null {
  const value = party?.trim().toUpperCase() ?? '';
  if (value === 'D' || value === 'DEM' || value === 'DFL' || value.startsWith('DEMOCRAT')) return 'D';
  if (value === 'R' || value === 'REP' || value === 'GOP' || value.startsWith('REPUBLICAN')) return 'R';
  return null;
}
