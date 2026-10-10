import type { MonitorParams } from "./useMonitorParams";

/** Every selected district: the Shift-click list, or just the focused district. */
export function selectedDistricts(params: Pick<MonitorParams, "district" | "districts">): string[] {
  if (params.districts.length > 0) return params.districts;
  return params.district ? [params.district] : [];
}

export function toggleItem(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((value) => value !== item) : [...list, item].sort();
}

/**
 * URL patch for a new district selection. A single district is stored only as
 * `district`; the focused district stays put while it is still selected.
 */
export function districtSelectionPatch(next: string[], focused: string | null): Pick<MonitorParams, "district" | "districts"> {
  if (next.length <= 1) return { district: next[0] ?? null, districts: [] };
  return { district: focused && next.includes(focused) ? focused : next[0], districts: next };
}
