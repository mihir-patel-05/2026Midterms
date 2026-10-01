import type { ContestOfficeType } from "@/features/election-dashboard/types";
import type { MonitorContest, OfficeFilter } from "./types";

export const FICTIONAL_STATE_CODE = "EX";

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

export function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
