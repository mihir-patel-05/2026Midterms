import { useQuery } from "@tanstack/react-query";

/** `public/data/state-results-links.json`: each state's election office, where official results are posted. */
export interface OfficialLinksFile {
  note: string;
  checkedAt: string | null;
  states: Record<string, { office: string; url: string }>;
}

export function useOfficialLinks() {
  return useQuery({
    queryKey: ["war-room", "official-results-links"],
    staleTime: Infinity,
    queryFn: async ({ signal }): Promise<OfficialLinksFile> => {
      const response = await fetch("/data/state-results-links.json", { signal });
      if (!response.ok) throw new Error(`Official results links returned ${response.status}`);
      return response.json() as Promise<OfficialLinksFile>;
    },
  });
}
