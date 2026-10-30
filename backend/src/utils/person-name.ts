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

// Common nicknames, to the name FEC usually files under. Prefixes (DAN/DANIEL, MATT/MATTHEW)
// need no entry.
const NICKNAMES: Record<string, string> = {
  BOB: 'ROBERT', BOBBY: 'ROBERT', ROBBIE: 'ROBERT', BILL: 'WILLIAM', BILLY: 'WILLIAM', WILL: 'WILLIAM', WILLIE: 'WILLIAM',
  JIM: 'JAMES', JIMMY: 'JAMES', JAMIE: 'JAMES', TOM: 'THOMAS', TOMMY: 'THOMAS', MIKE: 'MICHAEL', MICKEY: 'MICHAEL',
  DICK: 'RICHARD', RICK: 'RICHARD', RICKY: 'RICHARD', RICH: 'RICHARD', CHUCK: 'CHARLES', CHARLIE: 'CHARLES',
  DANNY: 'DANIEL', DAVE: 'DAVID', STEVE: 'STEVEN', STEPHEN: 'STEVEN', JOE: 'JOSEPH', JOEY: 'JOSEPH', JACK: 'JOHN',
  JOHNNY: 'JOHN', ED: 'EDWARD', EDDIE: 'EDWARD', TED: 'EDWARD', KATE: 'KATHERINE', KATIE: 'KATHERINE', KATHY: 'KATHERINE',
  CATHY: 'KATHERINE', CATHERINE: 'KATHERINE', LIZ: 'ELIZABETH', BETH: 'ELIZABETH', BETSY: 'ELIZABETH',
  PEGGY: 'MARGARET', MAGGIE: 'MARGARET', PATTY: 'PATRICIA', TRISH: 'PATRICIA', SUE: 'SUSAN', SUSIE: 'SUSAN',
  DEB: 'DEBORAH', DEBBIE: 'DEBORAH', NICK: 'NICHOLAS', NICKY: 'NICHOLAS', TONY: 'ANTHONY', ANDY: 'ANDREW', DREW: 'ANDREW',
  HANK: 'HENRY', LARRY: 'LAWRENCE', JERRY: 'GERALD', GENE: 'EUGENE', WALT: 'WALTER', FRED: 'FREDERICK', ZACK: 'ZACHARY',
};

/**
 * Whether two upper-case first names can be one person: equal, a nickname of the other
 * (BOB/ROBERT), or a prefix of at least three letters (ROB/ROBERT, MITCH/MITCHELL).
 */
export function sameFirstName(a: string, b: string): boolean {
  if (!a || !b) return false;
  const [x, y] = [NICKNAMES[a] ?? a, NICKNAMES[b] ?? b];
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 3 && long.startsWith(short);
}
