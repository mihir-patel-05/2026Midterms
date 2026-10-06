import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { stateMapItems } from "@/features/election-dashboard/map";
import { getCandidates, lookupDistrict } from "@/lib/api";
import { cn } from "@/lib/utils";
import { DASHBOARD_PATH } from "./navLinks";

interface SearchResult {
  key: string;
  kind: "State" | "District" | "Candidate" | "Address";
  label: string;
  detail: string;
  /** Where the result navigates; absent on the address row, which runs a lookup instead. */
  to?: string;
}

/** A pending or finished address lookup for one query. */
type AddressLookup =
  | { query: string; status: "loading" }
  | { query: string; status: "error"; message: string }
  | { query: string; status: "choices"; choices: SearchResult[] };

/** A ZIP, or something with a house number and a street, e.g. "500 Congress Ave Austin". */
function looksLikeAddress(term: string) {
  return /^\d{5}(-\d{4})?$/.test(term) || (term.length >= 8 && /\d/.test(term) && /\s/.test(term));
}

function districtTo(state: string, district: string) {
  return `${DASHBOARD_PATH}?state=${state}&district=${district}&layer=districts`;
}

const statesByCode = new Map(stateMapItems.map((state) => [state.code, state.name]));

function useDebounced<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function titleCaseName(raw: string) {
  const [last, rest] = raw.split(",").map((part) => part.trim());
  const ordered = rest ? `${rest} ${last}` : raw;
  return ordered.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Search states, House districts ("MI-7", "TX 22") and FEC candidates from the top bar. Press "/" to focus. */
export function GlobalSearch({ className }: { className?: string }) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const term = useDebounced(query.trim(), 200);
  const [lookup, setLookup] = useState<AddressLookup | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const local = useMemo<SearchResult[]>(() => {
    if (!term) return [];
    const lower = term.toLowerCase();
    const results: SearchResult[] = [];
    if (looksLikeAddress(term)) {
      results.push({ key: "address", kind: "Address", label: `Find 2026 district for "${term}"`, detail: "Looks up the address with the 2026 district maps" });
    }
    const district = term.match(/^([A-Za-z]{2})[-\s]?(\d{1,2}|AL)$/i);
    if (district && statesByCode.has(district[1].toUpperCase())) {
      const code = district[1].toUpperCase();
      const number = district[2].toUpperCase() === "AL" ? "00" : district[2].padStart(2, "0");
      results.push({
        key: `d-${code}-${number}`,
        kind: "District",
        label: `${code}-${number === "00" ? "AL" : number}`,
        detail: `${statesByCode.get(code)} congressional district`,
        to: `${DASHBOARD_PATH}?state=${code}&district=${number}&layer=districts`,
      });
    }
    const rank = (state: (typeof stateMapItems)[number]) => {
      const name = state.name.toLowerCase();
      return state.code.toLowerCase() === lower ? 0 : name.startsWith(lower) ? 1 : name.includes(lower) ? 2 : -1;
    };
    stateMapItems
      .map((state) => ({ state, score: rank(state) }))
      .filter((item) => item.score >= 0)
      .sort((a, b) => a.score - b.score || a.state.name.localeCompare(b.state.name))
      .forEach(({ state }) => results.push({ key: `s-${state.code}`, kind: "State", label: state.name, detail: `${state.code} · federal contests`, to: `${DASHBOARD_PATH}?state=${state.code}` }));
    return results.slice(0, 5);
  }, [term]);

  const candidates = useQuery({
    queryKey: ["global-search", "candidates", term],
    enabled: term.length >= 3,
    staleTime: 60_000,
    queryFn: async () => {
      const response = await getCandidates({ search: term, perPage: 6, cycle: 2026 });
      return response.data.map<SearchResult>((candidate) => ({
        key: `c-${candidate.id}`,
        kind: "Candidate",
        label: titleCaseName(candidate.name),
        detail: [candidate.party, candidate.office === "S" || candidate.office === "SENATE" ? `${candidate.state} Senate` : `${candidate.state}${candidate.district ? `-${candidate.district}` : ""} House`].filter(Boolean).join(" · "),
        to: `/candidates/${candidate.id}`,
      }));
    },
  });

  const activeLookup = lookup && lookup.query === term ? lookup : null;
  const results = activeLookup
    ? activeLookup.status === "choices" ? activeLookup.choices : []
    : [...local, ...(candidates.data ?? [])];
  const showList = open && term.length > 0;
  const go = (to: string) => {
    setOpen(false);
    setQuery("");
    setLookup(null);
    inputRef.current?.blur();
    navigate(to);
  };
  // Lookups are billed, so they run only when the address row is chosen, never per keystroke.
  const runLookup = async (address: string) => {
    setLookup({ query: address, status: "loading" });
    try {
      const response = await lookupDistrict(address);
      const choices = response.districts.map<SearchResult>(({ state, district, proportion }) => ({
        key: `a-${state}-${district}`,
        kind: "District",
        label: `${state}-${district === "00" ? "AL" : district}`,
        detail: response.districts.length > 1
          ? `${Math.round(proportion * 100)}% of ${response.formattedAddress || "this area"}`
          : `2026 district for ${response.formattedAddress || address}`,
        to: districtTo(state, district),
      }));
      if (choices.length === 1) go(choices[0].to!);
      else {
        setLookup({ query: address, status: "choices", choices });
        setActive(0);
      }
    } catch (error) {
      setLookup({ query: address, status: "error", message: error instanceof Error ? error.message : "District lookup is unavailable" });
    }
  };
  const choose = (result: SearchResult | undefined) => {
    if (!result) return;
    if (result.kind === "Address") void runLookup(term);
    else if (result.to) go(result.to);
  };

  return (
    <div className={cn("relative w-full max-w-[680px]", className)}>
      <label className="relative block">
        <span className="sr-only">Search states, districts, or candidates</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
          value={query}
          placeholder="Search states, districts, or candidates…"
          autoComplete="off"
          onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => Math.min(index + 1, results.length - 1)); }
            else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)); }
            else if (event.key === "Enter") { event.preventDefault(); choose(results[active]); }
            else if (event.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
          }}
          className="h-[42px] w-full rounded-[10px] [&::-webkit-search-cancel-button]:appearance-none border border-line bg-surface-2 pl-10 pr-12 text-[0.9rem] text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-quiet focus:border-signal-teal/60 focus:shadow-[0_0_0_4px_hsl(var(--signal-teal)/0.08)]"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[0.7rem] text-quiet" aria-hidden="true">/</kbd>
      </label>

      {showList && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[360px] overflow-auto rounded-[10px] border border-line bg-surface p-1.5 shadow-xl">
          {results.map((result, index) => (
            <li
              key={result.key}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => { event.preventDefault(); choose(result); }}
              onMouseEnter={() => setActive(index)}
              className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2", index === active && "bg-surface-3")}
            >
              <span className="w-16 shrink-0 font-mono text-[0.62rem] font-bold uppercase tracking-[0.08em] text-quiet">{result.kind}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-foreground">{result.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{result.detail}</span>
              </span>
            </li>
          ))}
          {activeLookup && activeLookup.status !== "choices" && (
            <li className="px-2.5 py-3 text-sm text-muted-foreground" role="presentation" aria-live="polite">
              {activeLookup.status === "loading" ? "Finding your 2026 district…" : activeLookup.message}
            </li>
          )}
          {activeLookup?.status === "choices" && (
            <li className="px-2.5 pb-1 pt-2 text-xs text-quiet" role="presentation">This area spans more than one 2026 district. Pick one, or search a full street address.</li>
          )}
          {!activeLookup && results.length === 0 && (
            <li className="px-2.5 py-3 text-sm text-muted-foreground" role="presentation">
              {candidates.isFetching || term !== query.trim() ? "Searching…" : candidates.isError ? "Candidate search is unavailable right now." : term.length < 3 ? "Keep typing to search candidates." : "No matches."}
            </li>
          )}
          {!activeLookup && results.length > 0 && candidates.isFetching && <li className="px-2.5 py-1.5 text-xs text-quiet" role="presentation">Searching candidates…</li>}
        </ul>
      )}
    </div>
  );
}
