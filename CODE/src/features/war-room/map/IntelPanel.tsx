import { useSearchParams } from "react-router-dom";
import { AreaBrief } from "@/features/election-monitor/AreaBrief";
import { DemographicsTab } from "@/features/election-monitor/DemographicsTab";
import { EconomyTab } from "@/features/election-monitor/EconomyTab";
import { districtSelectionPatch } from "@/features/election-monitor/selection";
import type { MonitorParams } from "@/features/election-monitor/useMonitorParams";
import { HOUSE_APPORTIONMENT } from "@/features/simulator/midterms/races2026";
import { demographicsEnabled, economyEnabled, newsEnabled } from "@/lib/featureFlags";
import { StateNews } from "../news/StateNews";
import { Brackets } from "../panels/Panel";
import { STATE_NAMES } from "../raceCodes";
// The monitor's cards, rendered in War Room tokens; every rule in it is an em- class.
import "@/features/election-monitor/monitor.css";

type IntelTab = "brief" | "people" | "economy" | "news";
const TABS: Array<{ id: IntelTab; label: string; on: boolean }> = [
  { id: "brief", label: "Brief", on: true },
  { id: "people", label: "Demographics", on: demographicsEnabled },
  { id: "economy", label: "Economy", on: economyEnabled || demographicsEnabled },
  { id: "news", label: "News", on: newsEnabled },
];

function readIntelTab(search: URLSearchParams): IntelTab {
  const value = search.get("intel");
  return TABS.some((tab) => tab.on && tab.id === value) ? (value as IntelTab) : "brief";
}

/** Every House district code in a state ("00" for an at-large seat). */
function stateDistricts(state: string | null) {
  const seats = state ? HOUSE_APPORTIONMENT[state] ?? 0 : 0;
  return seats === 1 ? ["00"] : Array.from({ length: seats }, (_, i) => String(i + 1).padStart(2, "0"));
}

/**
 * Everything about the selection on the map, in four tabs: the brief (seat holders, vote history, key Census
 * figures), the full ACS profile with CSV export, the state and U.S. economy, and the state's news.
 */
export function IntelPanel({ params, update, districts }: {
  params: MonitorParams;
  update: (patch: Partial<MonitorParams>) => void;
  /** Every selected district, including the one in focus. */
  districts: string[];
}) {
  const [search, setSearch] = useSearchParams();
  const tab = readIntelTab(search);
  const setTab = (next: IntelTab) => setSearch((current) => {
    const query = new URLSearchParams(current);
    if (next === "brief") query.delete("intel");
    else query.set("intel", next);
    return query;
  }, { replace: true });
  const state = params.state && STATE_NAMES[params.state] ? params.state : null;
  const stateName = state ? STATE_NAMES[state] : null;

  return (
    <section className="wr-panel wr-intel" aria-label="Selection intel">
      <Brackets top />
      <div className="wr-intel-tabs wr-seg" role="tablist" aria-label="Intel">
        {TABS.filter((item) => item.on).map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>
        ))}
      </div>
      <div className="wr-intel-body" role="tabpanel">
        {tab === "brief" && (
          <AreaBrief stateCode={state} stateName={stateName} district={params.district} districts={districts} counties={params.counties}
            onOpenProfile={() => setTab(demographicsEnabled ? "people" : "brief")} />
        )}
        {tab === "people" && (
          <DemographicsTab
            full
            stateCode={state}
            stateName={stateName}
            counties={params.counties}
            districts={districts}
            districtOptions={stateDistricts(state)}
            onCountiesChange={(counties) => update({ counties })}
            onDistrictsChange={(next) => update({ ...districtSelectionPatch(next, params.district), contest: null })}
            onClear={() => update({ counties: [], district: null, districts: [], contest: null })}
          />
        )}
        {tab === "economy" && <EconomyTab stateCode={state} stateName={stateName} counties={params.counties} districts={districts} />}
        {tab === "news" && <StateNews state={state} />}
      </div>
    </section>
  );
}
