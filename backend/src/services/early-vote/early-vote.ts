/**
 * Early vote from civicAPI (PLAN.md §4.1, "Early vote tracker"): ballots requested, mail ballots returned, and
 * in-person early votes, by state and by county, split by party registration where the state publishes it.
 *
 * civicAPI is the provider we already use for results (docs/plans/civicapi-results.md): free, attribution
 * required, no key. Browsers never call it. This keeps the answer in memory, as the national polls do, so it
 * needs no database:
 * - The three national documents (`early-vote/US/{category}`) are read at most every `refreshMs`, on demand.
 *   They say which states have which category, but carry one date for the whole country, and on Nov 2 they
 *   lagged some states' own documents by a few thousand ballots.
 * - So each state's own document (`early-vote/{state}/{category}`) is what we show: its numbers, its own date,
 *   and its counties, together. It is read again when the national number for it moves away from it (at most
 *   every `refreshMs`) or after `stateMaxAgeMs`. A state whose document hasn't been read yet shows the national
 *   number with no date ("pending"), never the national date.
 * - National totals are the sum of what each state shows, so the totals and the rows always agree.
 *
 * Party here is the voter's registration, not how they voted, and early ballots are not results.
 */
import { z } from 'zod';
import type { CivicApiClient, FetchedDocument } from '../../features/election-results/civicapi/client.js';
import { HOUSE_SEATS } from '../../utils/house-seats.js';

export const EARLY_VOTE_CATEGORIES = ['returned', 'inperson', 'requested'] as const;
export type EarlyVoteCategory = (typeof EARLY_VOTE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<EarlyVoteCategory, string> = {
  returned: 'Mail ballots returned',
  inperson: 'In-person early votes',
  requested: 'Mail ballots requested',
};

/**
 * Party registration buckets. `npa` is no party or unaffiliated; `other` is every minor party civicAPI lists;
 * `unknown` is ballots in a state (or part of one) that publishes no party, which civicAPI calls "Unspecified".
 */
export const PARTY_KEYS = ['dem', 'rep', 'npa', 'other', 'unknown'] as const;
export type PartyKey = (typeof PARTY_KEYS)[number];
export type PartyCounts = Record<PartyKey, number>;

export interface Tally {
  total: number;
  parties: PartyCounts;
}

export interface EarlyVoteDocument {
  /** "US" or a state's postal code. */
  region: string;
  category: EarlyVoteCategory;
  electionName: string | null;
  /** YYYY-MM-DD of civicAPI's snapshot, or null when it gives none we can read. */
  snapshotDate: string | null;
  /** States for the national document, counties (by civicAPI's name) for a state's. */
  areas: Record<string, Tally>;
  total: Tally;
  /** Party labels that were read as `other` because they are not ones we know. Logged, never dropped. */
  unknownLabels: string[];
}

export const EARLY_VOTE_SOURCE = {
  name: 'civicAPI',
  url: 'https://civicapi.org/early-vote',
  attribution: 'Early vote data: civicAPI (civicapi.org)',
} as const;

export class EarlyVoteParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EarlyVoteParseError';
  }
}

export class EarlyVoteUnavailableError extends Error {
  constructor(message = 'Early vote data is unavailable') {
    super(message);
    this.name = 'EarlyVoteUnavailableError';
  }
}

/** Places civicAPI may list: the states, DC, and the territories. */
export const isEarlyVoteState = (code: string) => code !== 'US' && Object.prototype.hasOwnProperty.call(HOUSE_SEATS, code);

const emptyParties = (): PartyCounts => ({ dem: 0, rep: 0, npa: 0, other: 0, unknown: 0 });

/** civicAPI's party label as one of our buckets. Labels we don't know count as `other`, never as no party. */
export function partyKey(label: string): PartyKey | null {
  const value = label.trim().toLowerCase();
  if (/^democrat/.test(value)) return 'dem';
  if (/^republican/.test(value)) return 'rep';
  if (/^(unspecified|unknown|not specified)$/.test(value)) return 'unknown';
  if (/^(no party( affiliation)?|unaffiliated|nonpartisan|non-partisan|undeclared|unenrolled|independent|none|npa)$/.test(value)) return 'npa';
  if (/^(other|green|libertarian|constitution|working families|reform|natural law|socialist)/.test(value)) return 'other';
  return null;
}

const Leaf = z.object({ votes: z.number().finite().nonnegative() }).passthrough();
const Breakdown = z.record(z.string(), Leaf);
const DocumentSchema = z.object({
  state: z.string(),
  category: z.string(),
  election_name: z.string().nullish(),
  snapshot_date: z.string().nullish(),
  regions: z.record(z.string(), Breakdown),
  statewide_total: Breakdown.nullish(),
});

function tallyOf(breakdown: z.infer<typeof Breakdown>, unknownLabels: Set<string>): Tally {
  const parties = emptyParties();
  for (const [label, leaf] of Object.entries(breakdown)) {
    const key = partyKey(label);
    if (key === null) unknownLabels.add(label);
    parties[key ?? 'other'] += Math.round(leaf.votes);
  }
  return { total: PARTY_KEYS.reduce((sum, key) => sum + parties[key], 0), parties };
}

const sumTallies = (tallies: Tally[]): Tally => {
  const parties = emptyParties();
  for (const tally of tallies) for (const key of PARTY_KEYS) parties[key] += tally.parties[key];
  return { total: PARTY_KEYS.reduce((sum, key) => sum + parties[key], 0), parties };
};

export const sameTally = (a: Tally, b: Tally) => a.total === b.total && PARTY_KEYS.every((key) => a.parties[key] === b.parties[key]);

/**
 * One civicAPI early-vote document. It must be the region and category asked for. A national document keeps
 * only postal codes we know; the total is civicAPI's own `statewide_total`, or the sum of the areas without one.
 */
export function parseEarlyVoteDocument(payload: unknown, expected: { region: string; category: EarlyVoteCategory }): EarlyVoteDocument {
  const parsed = DocumentSchema.safeParse(payload);
  if (!parsed.success) throw new EarlyVoteParseError(`early-vote/${expected.region}/${expected.category}: ${parsed.error.issues[0]?.message ?? 'unexpected shape'}`);
  const body = parsed.data;
  if (body.state.toUpperCase() !== expected.region || body.category !== expected.category) {
    throw new EarlyVoteParseError(`early-vote/${expected.region}/${expected.category}: got ${body.state}/${body.category}`);
  }
  const unknownLabels = new Set<string>();
  const areas: Record<string, Tally> = {};
  for (const [name, breakdown] of Object.entries(body.regions)) {
    const area = expected.region === 'US' ? name.trim().toUpperCase() : name.trim();
    if (!area || (expected.region === 'US' && !isEarlyVoteState(area))) continue;
    areas[area] = tallyOf(breakdown, unknownLabels);
  }
  const total = body.statewide_total ? tallyOf(body.statewide_total, unknownLabels) : sumTallies(Object.values(areas));
  const date = body.snapshot_date && /^\d{4}-\d{2}-\d{2}$/.test(body.snapshot_date) && !Number.isNaN(Date.parse(`${body.snapshot_date}T00:00:00Z`))
    ? body.snapshot_date
    : null;
  return {
    region: expected.region,
    category: expected.category,
    electionName: body.election_name?.trim() || null,
    snapshotDate: date,
    areas,
    total,
    unknownLabels: [...unknownLabels].sort(),
  };
}

export interface StateCategoryView extends Tally {
  /** The state's own snapshot date, or null while only the national number is held for it. */
  asOf: string | null;
  /** When this server last saw the number change (ISO), or null if it hasn't changed since it was first read. */
  changedAt: string | null;
}

export interface EarlyVoteStateRow {
  state: string;
  categories: Partial<Record<EarlyVoteCategory, StateCategoryView>>;
}

export interface CategorySummary {
  label: string;
  /** False when civicAPI's national document for it has never been read. */
  available: boolean;
  /** The sum of every state's row, so it always agrees with the table. */
  total: Tally;
  /** States in this category, and how many of them publish party registration for at least some ballots. */
  states: number;
  partyStates: number;
  /** The oldest and newest state dates in it, and how many states have no date yet. */
  asOfRange: { oldest: string; newest: string } | null;
  undated: number;
}

export interface EarlyVoteNational {
  categories: Record<EarlyVoteCategory, CategorySummary>;
  states: EarlyVoteStateRow[];
  /** When civicAPI's national documents were last read (ISO). */
  checkedAt: string;
  /** When this server last saw any number change, or null. */
  changedAt: string | null;
  refreshSeconds: number;
  source: typeof EARLY_VOTE_SOURCE;
}

export interface StateCategoryDetail extends StateCategoryView {
  label: string;
  electionName: string | null;
  /** Counties (or civicAPI's other local areas), largest first. Empty when the state's own document failed to load. */
  counties: Array<{ name: string } & Tally>;
}

export interface EarlyVoteStateDetail {
  state: string;
  categories: Partial<Record<EarlyVoteCategory, StateCategoryDetail>>;
  checkedAt: string;
  source: typeof EARLY_VOTE_SOURCE;
}

export interface EarlyVoteTrackerOptions {
  /** How long the national documents are served before they are read again; also the shortest gap between reads of one state's document. */
  refreshMs: number;
  /** A state document older than this is read again even if nothing suggests it changed. */
  stateMaxAgeMs?: number;
  /** State documents read at once; the client's own rate limit still spaces them. */
  concurrency?: number;
  now?: () => number;
  log?: (message: string) => void;
}

interface Held {
  doc: EarlyVoteDocument;
  fetchedAt: number;
}

const stateKey = (state: string, category: EarlyVoteCategory) => `${state}:${category}`;
const emptyTally = (): Tally => ({ total: 0, parties: emptyParties() });

export class EarlyVoteTracker {
  private readonly nationalDocs = new Map<EarlyVoteCategory, Held>();
  private readonly stateDocs = new Map<string, Held>();
  private readonly stateReads = new Map<string, Promise<void>>();
  private readonly rowChangedAt = new Map<string, number>();
  private checkedAt = 0;
  private changedAt: number | null = null;
  private pending: Promise<void> | null = null;
  private sweeping: Promise<void> | null = null;
  private readonly now: () => number;
  private readonly log: (message: string) => void;

  constructor(private readonly client: Pick<CivicApiClient, 'get'>, private readonly options: EarlyVoteTrackerOptions) {
    this.now = options.now ?? Date.now;
    this.log = options.log ?? ((message) => console.warn(`[early-vote] ${message}`));
  }

  /** Every state's numbers by category, with national totals. Serves the last good answer while it refreshes. */
  async national(): Promise<EarlyVoteNational> {
    await this.ensureNational();
    return this.buildNational();
  }

  /** One state's numbers and counties for each category civicAPI lists it under (none: `categories` is empty). */
  async state(state: string): Promise<EarlyVoteStateDetail> {
    await this.ensureNational();
    const categories: EarlyVoteStateDetail['categories'] = {};
    await Promise.all(EARLY_VOTE_CATEGORIES.map(async (category) => {
      const national = this.nationalDocs.get(category)?.doc.areas[state];
      if (!national) return;
      const key = stateKey(state, category);
      const held = this.stateDocs.get(key);
      if (!held || this.isDue(held, national)) {
        try {
          await this.readState(state, category);
        } catch (error) {
          this.log(`${state} ${category} failed: ${error instanceof Error ? error.message : error}`);
        }
      }
      const doc = this.stateDocs.get(key)?.doc;
      categories[category] = {
        label: CATEGORY_LABELS[category],
        ...this.view(state, category, national),
        electionName: doc?.electionName ?? null,
        counties: doc ? Object.entries(doc.areas).map(([name, tally]) => ({ name, ...tally })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)) : [],
      };
    }));
    return { state, categories, checkedAt: new Date(this.checkedAt).toISOString(), source: EARLY_VOTE_SOURCE };
  }

  private async ensureNational() {
    const fresh = this.nationalDocs.size > 0 && this.now() - this.checkedAt < this.options.refreshMs;
    if (fresh) return;
    this.pending ??= this.loadNational().finally(() => {
      this.pending = null;
    });
    if (this.nationalDocs.size === 0) await this.pending;
    else this.pending.catch(() => {});
  }

  private async loadNational() {
    const results = await Promise.allSettled(EARLY_VOTE_CATEGORIES.map((category) => this.client.get(`early-vote/US/${category}`)));
    let read = 0;
    results.forEach((result, index) => {
      const category = EARLY_VOTE_CATEGORIES[index];
      if (result.status === 'rejected') {
        this.log(`national ${category} failed: ${result.reason instanceof Error ? result.reason.message : result.reason}`);
        return;
      }
      try {
        const held = this.nationalDocs.get(category);
        const doc = this.docFrom(result.value, 'US', category, held);
        if (held) this.noteNationalChanges(category, held.doc, doc);
        this.nationalDocs.set(category, { doc, fetchedAt: this.now() });
        read++;
      } catch (error) {
        this.log(`national ${category} unreadable: ${error instanceof Error ? error.message : error}`);
      }
    });
    if (read === 0 && this.nationalDocs.size === 0) throw new EarlyVoteUnavailableError();
    // A failed read is tried again after a short wait, not a full refresh interval.
    this.checkedAt = read > 0 ? this.now() : this.now() - this.options.refreshMs + Math.min(30_000, this.options.refreshMs);
    void this.sweepStates();
  }

  /** The document in a response, or the one already held when civicAPI answers 304. */
  private docFrom(fetched: FetchedDocument, region: string, category: EarlyVoteCategory, held: Held | undefined) {
    if (fetched.notModified) {
      if (!held) throw new EarlyVoteParseError(`early-vote/${region}/${category}: 304 with nothing held`);
      return held.doc;
    }
    const doc = parseEarlyVoteDocument(fetched.payload, { region, category });
    if (doc.unknownLabels.length) this.log(`${region} ${category}: party labels read as other: ${doc.unknownLabels.join(', ')}`);
    return doc;
  }

  /** A moved national number is a change only for states shown from it; the rest change when their own document does. */
  private noteNationalChanges(category: EarlyVoteCategory, before: EarlyVoteDocument, after: EarlyVoteDocument) {
    for (const [state, tally] of Object.entries(after.areas)) {
      const previous = before.areas[state];
      if (!previous || sameTally(previous, tally) || this.stateDocs.has(stateKey(state, category))) continue;
      this.markChanged(stateKey(state, category));
    }
  }

  private markChanged(key: string) {
    const now = this.now();
    this.rowChangedAt.set(key, now);
    this.changedAt = now;
  }

  /** Read again if the national number has moved away from it (not more than once a refresh), or if it is old. */
  private isDue(held: Held, national: Tally) {
    const age = this.now() - held.fetchedAt;
    return (!sameTally(held.doc.total, national) && age >= this.options.refreshMs) || age > (this.options.stateMaxAgeMs ?? 30 * 60_000);
  }

  /** One state document, read once however many requests ask for it at the same moment. */
  private readState(state: string, category: EarlyVoteCategory): Promise<void> {
    const key = stateKey(state, category);
    let read = this.stateReads.get(key);
    if (!read) {
      read = (async () => {
        const held = this.stateDocs.get(key);
        const doc = this.docFrom(await this.client.get(`early-vote/${state}/${category}`), state, category, held);
        if (held && !sameTally(held.doc.total, doc.total)) this.markChanged(key);
        this.stateDocs.set(key, { doc, fetchedAt: this.now() });
      })().finally(() => this.stateReads.delete(key));
      this.stateReads.set(key, read);
    }
    return read;
  }

  /** Reads every state document that is missing, has drifted from the national numbers, or is old. In the background. */
  sweepStates(): Promise<void> {
    this.sweeping ??= this.runSweep().finally(() => {
      this.sweeping = null;
    });
    return this.sweeping;
  }

  private async runSweep() {
    const due: Array<{ state: string; category: EarlyVoteCategory; rank: number }> = [];
    for (const [category, { doc }] of this.nationalDocs) {
      for (const [state, tally] of Object.entries(doc.areas)) {
        const held = this.stateDocs.get(stateKey(state, category));
        if (!held) due.push({ state, category, rank: 0 });
        else if (this.isDue(held, tally)) due.push({ state, category, rank: sameTally(held.doc.total, tally) ? 2 : 1 });
      }
    }
    due.sort((a, b) => a.rank - b.rank);
    let next = 0;
    let failed = 0;
    const worker = async () => {
      while (next < due.length) {
        const item = due[next++];
        try {
          await this.readState(item.state, item.category);
        } catch (error) {
          failed++;
          if (failed <= 5) this.log(`${item.state} ${item.category} failed: ${error instanceof Error ? error.message : error}`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.options.concurrency ?? 4, due.length) }, worker));
    if (failed > 5) this.log(`${failed} state documents failed in this sweep`);
  }

  /** What one state shows for a category: its own document if held, else the national number with no date. */
  private view(state: string, category: EarlyVoteCategory, national: Tally): StateCategoryView {
    const key = stateKey(state, category);
    const held = this.stateDocs.get(key);
    const changed = this.rowChangedAt.get(key);
    return {
      ...(held ? held.doc.total : national),
      asOf: held ? held.doc.snapshotDate : null,
      changedAt: changed ? new Date(changed).toISOString() : null,
    };
  }

  private buildNational(): EarlyVoteNational {
    const rows = new Map<string, EarlyVoteStateRow>();
    const categories = {} as Record<EarlyVoteCategory, CategorySummary>;
    for (const category of EARLY_VOTE_CATEGORIES) {
      const doc = this.nationalDocs.get(category)?.doc;
      const views = Object.entries(doc?.areas ?? {}).map(([state, national]) => [state, this.view(state, category, national)] as const);
      const dates = views.map(([, view]) => view.asOf).filter((date): date is string => date !== null).sort();
      categories[category] = {
        label: CATEGORY_LABELS[category],
        available: !!doc,
        total: views.reduce((sum, [, view]) => sumTallies([sum, view]), emptyTally()),
        states: views.length,
        partyStates: views.filter(([, view]) => view.parties.unknown < view.total).length,
        asOfRange: dates.length ? { oldest: dates[0], newest: dates[dates.length - 1] } : null,
        undated: views.length - dates.length,
      };
      for (const [state, view] of views) {
        const row = rows.get(state) ?? { state, categories: {} };
        row.categories[category] = view;
        rows.set(state, row);
      }
    }
    return {
      categories,
      states: [...rows.values()].sort((a, b) => a.state.localeCompare(b.state)),
      checkedAt: new Date(this.checkedAt).toISOString(),
      changedAt: this.changedAt ? new Date(this.changedAt).toISOString() : null,
      refreshSeconds: Math.round(this.options.refreshMs / 1000),
      source: EARLY_VOTE_SOURCE,
    };
  }
}
