/**
 * Parsing and classification for OpenFEC Schedule E (independent expenditures).
 *
 * An independent expenditure is money an outside group (a super PAC, party
 * committee, or 501(c) group) spends for or against a candidate without
 * coordinating with the campaign. OpenFEC returns one line per expenditure from:
 *
 * - 24- and 48-hour notices (`is_notice`), filed within a day or two of the
 *   spending; and
 * - regular reports (F3X, F5), which later list the same spending again.
 *
 * Both are stored. Which to count is decided when totals are computed.
 */
import type { Prisma } from '@prisma/client';

/** The subset of an OpenFEC /schedules/schedule_e/ result this app reads. All fields are optional on the wire. */
export interface FECScheduleE {
  sub_id?: string | number | null;
  cycle?: number | null;
  report_year?: number | null;
  committee_id?: string | null;
  committee?: { name?: string | null } | null;
  committee_name?: string | null;
  candidate_id?: string | null;
  candidate_name?: string | null;
  candidate_office?: string | null;
  candidate_office_state?: string | null;
  candidate_office_district?: string | null;
  support_oppose_indicator?: string | null;
  expenditure_amount?: number | string | null;
  expenditure_date?: string | null;
  dissemination_date?: string | null;
  expenditure_description?: string | null;
  payee_name?: string | null;
  is_notice?: boolean | null;
  memo_code?: string | null;
  filing_form?: string | null;
  transaction_id?: string | null;
  file_number?: number | string | null;
  pdf_url?: string | null;
}

/** How an outside group spent the money, from the free-text FEC description. */
export const COMMUNICATION_TYPES = [
  'TV and video',
  'Digital',
  'Mail and print',
  'Radio',
  'Phones and texts',
  'Field and canvassing',
  'Polling and research',
  'Production and consulting',
  'Other',
] as const;
export type CommunicationType = (typeof COMMUNICATION_TYPES)[number];

/**
 * Ordered rules: the first match wins, so specific media come before generic
 * words like "media buy" or "production". Streaming TV (CTV, OTT) counts as TV.
 */
const RULES: Array<[CommunicationType, RegExp]> = [
  ['Phones and texts', /\b(phone|calls?|text(ing)?|sms|peer[- ]to[- ]peer|ivr|robo|tele(phone|marketing)?)\b/i],
  ['Digital', /\b(digital|online|internet|web|e-?mail|social|facebook|meta|instagram|google|youtube|twitter|x\.com|tiktok|snapchat|programmatic|display ads?|search ads?|banner|influencer|streaming audio|podcast)\b/i],
  ['TV and video', /\b(tv|television|broadcast|cable|ctv|ott|connected tv|streaming|video|satellite|airtime)\b/i],
  ['Radio', /\b(radio|audio)\b/i],
  ['Mail and print', /\b(mail(ing|er|ers)?|postage|direct mail|print(ing)?|literature|lit|door ?hangers?|flyers?|brochures?|newspaper|signs?|billboards?|yard signs?)\b/i],
  ['Field and canvassing', /\b(canvass(ing)?|field|door[- ]knock(ing)?|doors|gotv|get out the vote|volunteer|walk(ers|ing)?|petition|voter contact|staff)\b/i],
  ['Polling and research', /\b(poll(ing)?|survey|research|focus group|data|analytics|modeling)\b/i],
  // "Media buy" with no medium named is almost always TV; bare "advertising" stays Other.
  ['TV and video', /\b(media buys?|ad buys?|media placement)\b/i],
  ['Production and consulting', /\b(production|produc(e|ed)|design|consult(ing|ant)?|creative|strategy|management|fees?)\b/i],
];

/** Deterministic classification of an FEC expenditure description. */
export function classifyCommunication(description: string | null | undefined): CommunicationType {
  const text = (description ?? '').trim();
  if (!text) return 'Other';
  for (const [type, pattern] of RULES) if (pattern.test(text)) return type;
  return 'Other';
}

const toDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const clean = (value: string | null | undefined): string | null => {
  const text = value?.trim();
  return text ? text : null;
};

/** "7" and "07" become "07"; Senate and presidential rows carry no district. */
export function normalizeIeDistrict(office: string | null, district: string | null | undefined): string | null {
  if (office !== 'H') return null;
  const text = clean(district);
  if (!text || !/^\d{1,2}$/.test(text)) return null;
  return text.padStart(2, '0');
}

/**
 * One Schedule E line as a database row, or null when it cannot be counted
 * (no ID, committee, amount, or for/against indicator).
 */
export function scheduleERow(raw: FECScheduleE, cycle: number, fetchedAt: Date): Prisma.IndependentExpenditureCreateInput | null {
  // OpenFEC sends sub_id as a string. A 19-digit ID parsed as a number has lost
  // precision and could collide with another line, so key it on the filing instead.
  const subId = typeof raw.sub_id === 'string' && raw.sub_id.trim()
    ? raw.sub_id.trim()
    : typeof raw.sub_id === 'number' && Number.isSafeInteger(raw.sub_id)
      ? String(raw.sub_id)
      : raw.file_number && raw.transaction_id ? `f${raw.file_number}:${raw.transaction_id}` : null;
  const committeeId = clean(raw.committee_id);
  const amount = Number(raw.expenditure_amount);
  const supportOppose = clean(raw.support_oppose_indicator)?.toUpperCase();
  if (!subId || !committeeId || !Number.isFinite(amount) || (supportOppose !== 'S' && supportOppose !== 'O')) return null;

  const office = clean(raw.candidate_office)?.toUpperCase() ?? null;
  const fileNumber = Number(raw.file_number);
  return {
    subId,
    cycle: raw.cycle ?? cycle,
    committeeId,
    committeeName: clean(raw.committee?.name) ?? clean(raw.committee_name) ?? committeeId,
    candidateId: clean(raw.candidate_id),
    candidateName: clean(raw.candidate_name),
    candidateOffice: office,
    candidateState: clean(raw.candidate_office_state)?.toUpperCase() ?? null,
    candidateDistrict: normalizeIeDistrict(office, raw.candidate_office_district),
    supportOppose,
    amount: Math.round(amount * 100) / 100,
    expenditureDate: toDate(raw.expenditure_date),
    disseminationDate: toDate(raw.dissemination_date),
    description: clean(raw.expenditure_description),
    communicationType: classifyCommunication(raw.expenditure_description),
    payeeName: clean(raw.payee_name),
    isNotice: raw.is_notice === true,
    isMemo: clean(raw.memo_code)?.toUpperCase() === 'X',
    filingForm: clean(raw.filing_form),
    transactionId: clean(raw.transaction_id),
    fileNumber: Number.isInteger(fileNumber) ? fileNumber : null,
    pdfUrl: clean(raw.pdf_url),
    fetchedAt,
  };
}
