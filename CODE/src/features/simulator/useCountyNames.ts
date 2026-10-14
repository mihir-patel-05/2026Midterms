import { useQuery } from "@tanstack/react-query";
import { loadCounties } from "@/features/election-monitor/map/geo";

/**
 * County FIPS → full name ("Maricopa County"), from the same geometry the map draws. The loader
 * caches its promise, so this shares the map's download rather than adding one.
 */
export function useCountyNames(enabled: boolean) {
  return useQuery({
    queryKey: ["geo", "county-names"],
    queryFn: async () => new Map((await loadCounties()).features.map((item) => [item.properties.fips, item.properties.name])),
    enabled,
    staleTime: Infinity,
  });
}
