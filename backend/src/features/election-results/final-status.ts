/**
 * Where a race stands after election night (#136, docs/plans/lock-2026-record.md). Derived when the result is
 * read, never stored as a number:
 *
 * - a recorded certification, recount or contest (entered by an admin with the state's source) comes first;
 * - then the races that need their own words: unopposed, runoff, ranked choice;
 * - otherwise "still counting" until the race-level totals have stood still for 72 hours, then "no change since".
 *
 * civicAPI's share-counted estimate decides nothing here: after election night it reads 75% in states that
 * finished counting long ago.
 */
import type { FinalStatus, FinalStatusKind } from './contracts.js';

/** Totals unchanged for this long read "no change since" instead of "still counting". */
export const STABLE_AFTER_HOURS = 72;
/** States whose federal races are counted by ranked choice. */
export const RANKED_CHOICE_STATES = new Set(['AK', 'ME']);

export interface CertificationEventInput {
  type: 'UNOFFICIAL_RESULTS_PUBLISHED' | 'CANVASS_STARTED' | 'AUDIT_STARTED' | 'CERTIFIED' | 'RECOUNT_STARTED' | 'RECOUNT_COMPLETED' | 'CONTESTED' | 'CORRECTED';
  certification: 'UNOFFICIAL' | 'CANVASSING' | 'CERTIFIED' | 'RECOUNT' | 'CONTESTED';
  effectiveAt: Date;
  sourceUrl: string;
  notes: string | null;
}

export interface FinalStatusInput {
  now: Date;
  stateCode: string | null;
  /** When the race-level totals last changed. */
  lastChangedAt: Date;
  /** The latest certification event for the contest, if any. */
  latestEvent: CertificationEventInput | null;
  deadline: { deadline: Date; sourceUrl: string } | null;
  /** Candidates on the ballot, write-ins left out. */
  ballotCandidates: number;
  hasWinnerCall: boolean;
  hasAdvancedCall: boolean;
  rankedChoiceFinalRound?: FinalStatus['rankedChoiceFinalRound'];
}

const etDate = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
const day = (date: Date) => etDate.format(date);

/** Which status a recorded event sets, or null when the event does not settle the race's status. */
function eventStatus(event: CertificationEventInput): FinalStatusKind | null {
  if (event.certification === 'CERTIFIED') return 'CERTIFIED';
  if (event.certification === 'RECOUNT' || event.type === 'RECOUNT_STARTED') return 'RECOUNT';
  if (event.certification === 'CONTESTED' || event.type === 'CONTESTED') return 'CONTESTED';
  return null;
}

export function deriveFinalStatus(input: FinalStatusInput): FinalStatus {
  const deadline = input.deadline
    ? { certificationDeadline: input.deadline.deadline.toISOString().slice(0, 10), certificationDeadlineSourceUrl: input.deadline.sourceUrl }
    : {};
  const base = { lastChangedAt: input.lastChangedAt.toISOString(), ...deadline, ...(input.rankedChoiceFinalRound ? { rankedChoiceFinalRound: input.rankedChoiceFinalRound } : {}) };
  const fromEvent = input.latestEvent ? eventStatus(input.latestEvent) : null;
  if (input.latestEvent && fromEvent) {
    const event = input.latestEvent;
    const label = fromEvent === 'CERTIFIED' ? `Certified ${day(event.effectiveAt)}`
      : fromEvent === 'RECOUNT' ? `Recount · since ${day(event.effectiveAt)}`
        : `Contested · since ${day(event.effectiveAt)}`;
    return {
      status: fromEvent, label, ...base,
      effectiveAt: event.effectiveAt.toISOString(), sourceUrl: event.sourceUrl,
      ...(event.notes?.trim() ? { notes: event.notes.trim().slice(0, 1000) } : {}),
    };
  }
  if (input.ballotCandidates <= 1) return { status: 'UNOPPOSED', label: 'Unopposed', ...base };
  if (input.hasAdvancedCall) return { status: 'RUNOFF', label: 'Runoff · the top two advance', ...base };
  if (input.stateCode && RANKED_CHOICE_STATES.has(input.stateCode) && (!input.hasWinnerCall || input.rankedChoiceFinalRound)) {
    return {
      status: 'RANKED_CHOICE',
      label: input.rankedChoiceFinalRound ? 'Ranked-choice final round · unofficial' : 'First-choice votes · ranked-choice count by the state',
      ...base,
    };
  }
  const stable = input.now.getTime() - input.lastChangedAt.getTime() >= STABLE_AFTER_HOURS * 3_600_000;
  return stable
    ? { status: 'STABLE', label: `Unofficial · no change since ${day(input.lastChangedAt)}`, ...base }
    : { status: 'COUNTING', label: `Unofficial · still counting · last change ${day(input.lastChangedAt)}`, ...base };
}
