import type { ContestOfficeType } from "@/features/election-dashboard/types";
import type { MapLayer, MonitorContest, OfficeFilter } from "./types";

export const FICTIONAL_STATE_CODE = "EX";

export const layerOptions: Array<{ value: MapLayer; label: string }> = [
  { value: "states", label: "States" },
  { value: "districts", label: "House districts" },
  { value: "counties", label: "Counties" },
];

export const officeLabels: Record<ContestOfficeType, string> = {
  US_SENATE: "U.S. Senate",
  US_HOUSE: "U.S. House",
  STATEWIDE_EXECUTIVE: "Statewide",
  COUNTY_OFFICE: "County",
  OTHER: "Other",
};

export function contestMatchesOffice(contest: MonitorContest, office: OfficeFilter) {
  return office === "ALL" || contest.office === office;
}

export function districtLabel(stateCode: string, district: string | null) {
  if (!district) return stateCode;
  return district === "00" ? `${stateCode}-AL` : `${stateCode}-${district}`;
}

export const numberFormat = new Intl.NumberFormat("en-US");

export function formatEtTime(iso: string, withSeconds = false) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
    hour12: false,
    timeZone: "America/New_York",
  }).format(new Date(iso));
}

/** "Sep 30, 2026" for a date-only or full ISO string, without shifting the day across time zones. */
export function formatShortDate(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** How a market price was derived, in words, for the label next to it. */
export function priceTypeLabel(types: Array<"MIDPOINT" | "LAST_TRADE" | null>) {
  const kinds = new Set(types.filter(Boolean));
  if (kinds.size === 0) return null;
  if (kinds.size > 1) return "bid/ask midpoint or last trade";
  return kinds.has("MIDPOINT") ? "bid/ask midpoint" : "last trade";
}

/** Party colour tokens; follows the existing CandidateCard convention (DEM blue, REP coral). */
export function partyTone(party: string | null, index = 0) {
  const normalized = party?.toUpperCase() ?? "";
  if (normalized.includes("DEM")) return { fg: "hsl(var(--signal-blue))", bg: "hsl(var(--signal-blue-deep))" };
  if (normalized.includes("REP")) return { fg: "hsl(var(--signal-coral))", bg: "hsl(var(--signal-coral-deep))" };
  const others = [
    { fg: "hsl(var(--signal-purple))", bg: "hsl(251 40% 25%)" },
    { fg: "hsl(var(--signal-teal))", bg: "hsl(var(--signal-teal-deep))" },
    { fg: "hsl(var(--signal-amber))", bg: "hsl(41 40% 18%)" },
  ];
  return others[index % others.length];
}

/** FEC stores names as "LAST, FIRST MIDDLE"; show "First Middle Last". */
export function displayName(raw: string) {
  const [last, rest] = raw.split(",").map((part) => part.trim());
  const ordered = rest ? `${rest} ${last}` : raw;
  return ordered === ordered.toUpperCase()
    ? ordered.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())
    : ordered;
}

const MINOR_WORDS = new Set(["A", "AN", "AND", "AS", "AT", "BY", "FOR", "IN", "OF", "ON", "OR", "THE", "TO"]);
const COMMITTEE_ACRONYMS = new Set(["PAC", "PACS", "USA", "US", "LLC", "GOP", "AFL", "CIO", "SEIU", "NEA", "AFT", "UAW", "AIPAC", "NRA", "DC"]);

/** FEC committee names arrive in capitals: "HOUSE MAJORITY PAC" → "House Majority PAC", keeping acronyms. */
export function committeeName(raw: string) {
  if (raw !== raw.toUpperCase()) return raw;
  return raw.split(/(\s+|-|\/)/).map((word, index) => {
    const bare = word.replace(/[^A-Z]/g, "");
    if (index > 0 && MINOR_WORDS.has(word)) return word.toLowerCase();
    // Known acronyms, and short words with no vowels (DCCC, NRCC), stay in capitals.
    if (COMMITTEE_ACRONYMS.has(bare) || (bare.length >= 2 && bare.length <= 5 && !/[AEIOUY]/.test(bare))) return word;
    return word.toLowerCase().replace(/(^|['.])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
  }).join("");
}

export function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** FEC ID → the name shown on the race card, so polls that give surnames read the same. */
export function candidateNamesOf(contest: { candidates: Array<{ fecId?: string; name: string }> } | undefined): Record<string, string> {
  return Object.fromEntries((contest?.candidates ?? []).flatMap((candidate) => (candidate.fecId ? [[candidate.fecId, candidate.name]] : [])));
}
