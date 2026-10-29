/**
 * When polls close on Nov 3, 2026, in Eastern time (EST, UTC−5; daylight saving ends Nov 1). Each state is listed
 * at the time most of its polls close, as the networks do; states split across time zones also carry the time
 * their last polls close.
 *
 * Compiled Oct 29, 2026 from published schedules (270toWin's local poll closing times for November 2026, The Hill,
 * The Open Count). Confirm each against the state's election office before Nov 3. North Dakota sets hours by county
 * (7 to 9 p.m. local), and New Hampshire towns differ, so both are marked as varying.
 */
export interface PollClosing {
  state: string;
  /** Epoch ms when most of the state's polls close. */
  close: number;
  /** When the last polls close, for states split across time zones. */
  last?: number;
  note?: string;
}

/** Nov 3 at `hour`:`minute` Eastern; hour 24 is midnight into Nov 4. */
export const et = (hour: number, minute = 0) => Date.UTC(2026, 10, 3, hour + 5, minute);

const at = (time: number, states: string[], extra: Partial<Record<string, Omit<PollClosing, "state" | "close">>> = {}) =>
  states.map((state): PollClosing => ({ state, close: time, ...extra[state] }));

export const POLL_CLOSINGS: PollClosing[] = [
  ...at(et(18), ["IN", "KY"], { IN: { last: et(19), note: "Central-time counties close at 19:00" }, KY: { last: et(19), note: "Central-time counties close at 19:00" } }),
  ...at(et(19), ["FL", "GA", "NH", "SC", "VA", "VT"], { FL: { last: et(20), note: "The western Panhandle closes at 20:00" }, NH: { last: et(20), note: "Hours vary by town; some close at 20:00" } }),
  ...at(et(19, 30), ["NC", "OH", "WV"]),
  ...at(et(20), ["AL", "CT", "DC", "DE", "IL", "KS", "MA", "MD", "ME", "MI", "MO", "MS", "NJ", "OK", "PA", "RI", "SD", "TN", "TX"], {
    KS: { last: et(21), note: "Mountain-time counties close at 21:00" },
    MI: { last: et(21), note: "Four Upper Peninsula counties close at 21:00" },
    SD: { last: et(21), note: "The western half closes at 21:00" },
    TX: { last: et(21), note: "El Paso and Hudspeth counties close at 21:00" },
  }),
  ...at(et(20, 30), ["AR"]),
  ...at(et(21), ["AZ", "CO", "IA", "LA", "MN", "ND", "NE", "NM", "NY", "WI", "WY"], {
    ND: { last: et(23), note: "Hours vary by county, 20:00 to 23:00" },
    NE: { last: et(22), note: "Mountain-time counties close at 22:00" },
  }),
  ...at(et(22), ["ID", "MT", "NV", "UT"], { ID: { last: et(23), note: "The northern panhandle closes at 23:00" } }),
  ...at(et(23), ["CA", "OR", "WA"]),
  ...at(et(24), ["AK", "HI"], { AK: { last: et(25), note: "The Aleutians close at 01:00" } }),
];

export interface ClosingSlot {
  close: number;
  states: PollClosing[];
}

/** The timeline: one slot per closing time, in order, states alphabetical. */
export function closingSlots(closings: PollClosing[] = POLL_CLOSINGS): ClosingSlot[] {
  const byTime = new Map<number, PollClosing[]>();
  for (const item of closings) byTime.set(item.close, [...(byTime.get(item.close) ?? []), item]);
  return [...byTime.entries()].sort(([a], [b]) => a - b)
    .map(([close, states]) => ({ close, states: [...states].sort((a, b) => a.state.localeCompare(b.state)) }));
}

/** States (and DC) where most polls have closed. */
export const closedCount = (now: number, closings: PollClosing[] = POLL_CLOSINGS) => closings.filter((item) => item.close <= now).length;

/** The next closing time after `now`, or null once every poll has closed. */
export function nextClose(now: number, closings: PollClosing[] = POLL_CLOSINGS) {
  const later = closings.flatMap((item) => [item.close, item.last ?? item.close]).filter((time) => time > now).sort((a, b) => a - b);
  return later[0] ?? null;
}

export const closingFor = (state: string) => POLL_CLOSINGS.find((item) => item.state === state);
