import { useQuery } from "@tanstack/react-query";
import { API_BASE_URL } from "@/lib/apiBase";

/**
 * Runtime off switches for the War Room's election-night extras, set by an admin (admin dashboard, War Room switches)
 * without a deploy. Every flag is on until the API says otherwise, and the last answer is kept if the API stops
 * answering, so a blip never flips a switch. Refreshed every minute.
 */
export const WAR_ROOM_FLAG_NAMES = [
  "runoff_labels",
  "next_close_countdown",
  "retracted_calls",
  "stale_prices",
  "caucus_note",
  "control_banner",
  "hide_coming_soon",
  "watchlist_alerts",
] as const;

export type WarRoomFlag = (typeof WAR_ROOM_FLAG_NAMES)[number];
export type WarRoomFlags = Record<WarRoomFlag, boolean>;

export const ALL_ON: WarRoomFlags = Object.fromEntries(WAR_ROOM_FLAG_NAMES.map((name) => [name, true])) as WarRoomFlags;

/** Reads the API's answer; anything missing or not a boolean stays on. */
export function parseFlags(body: unknown): WarRoomFlags {
  const flags = { ...ALL_ON };
  const raw = body && typeof body === "object" ? (body as { flags?: unknown }).flags : null;
  if (raw && typeof raw === "object") {
    for (const name of WAR_ROOM_FLAG_NAMES) {
      const value = (raw as Record<string, unknown>)[name];
      if (typeof value === "boolean") flags[name] = value;
    }
  }
  return flags;
}

export function useWarRoomFlags(): WarRoomFlags {
  const query = useQuery({
    queryKey: ["war-room", "flags"],
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
    retry: 1,
    queryFn: async ({ signal }) => {
      const response = await fetch(`${API_BASE_URL}/api/war-room/flags`, { signal });
      if (!response.ok) throw new Error(`Flags returned ${response.status}`);
      return parseFlags(await response.json());
    },
  });
  return query.data ?? ALL_ON;
}

export function useWarRoomFlag(name: WarRoomFlag): boolean {
  return useWarRoomFlags()[name];
}
