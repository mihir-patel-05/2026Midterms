import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Flag } from "lucide-react";
import { ElectionDashboardShell } from "@/features/election-dashboard/ElectionDashboardShell";
import { PredictionMarketsPanel } from "@/features/election-dashboard/PredictionMarketsPanel";
import { stateMapItems } from "@/features/election-dashboard/map";
import "@/features/election-dashboard/election-dashboard.css";

const dashboardEnabled = import.meta.env.VITE_FEATURE_ELECTION_DASHBOARD === "true";
const mockProviderEnabled = import.meta.env.VITE_RESULTS_PROVIDER_MOCK_ENABLED === "true";

export default function ElectionDashboard() {
  if (dashboardEnabled && mockProviderEnabled) return <ElectionDashboardShell />;
  if (dashboardEnabled) return <LivePredictionDashboard />;

  return (
    <main className="min-h-screen bg-background px-6 py-20 text-foreground">
      <div className="mx-auto max-w-xl rounded-xl border border-border bg-card p-8 text-center shadow-lg">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><Flag aria-hidden="true" /></div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Election dashboard beta</p>
        <h1 className="mt-2 text-2xl font-bold">Feature not enabled</h1>
        <p className="mt-3 text-muted-foreground">This beta route is protected by a feature flag and is not available in this environment.</p>
        <Link className="mt-6 inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 font-semibold text-primary-foreground" to="/elections">
          Return to elections
        </Link>
      </div>
    </main>
  );
}

function LivePredictionDashboard() {
  const [params, setParams] = useSearchParams();
  const initialState = params.get('state')?.toUpperCase() || '';
  const initialDistrict = params.get('district') || '';
  const [state, setState] = useState(stateMapItems.some((item) => item.code === initialState) ? initialState : '');
  const [district, setDistrict] = useState(/^\d{2}$/.test(initialDistrict) ? initialDistrict : '');

  function update(stateCode: string, districtCode: string) {
    setState(stateCode);
    setDistrict(districtCode);
    const next = new URLSearchParams(params);
    if (stateCode) next.set('state', stateCode); else next.delete('state');
    if (stateCode && districtCode) next.set('district', districtCode); else next.delete('district');
    setParams(next, { replace: true });
  }

  return <main className="ed-root ed-live-dashboard">
    <header className="ed-topbar"><div><span className="ed-eyebrow">2026 midterms</span><h1>Prediction market dashboard</h1></div><Link to="/elections">Federal elections</Link></header>
    <div className="ed-live-content">
      <div className="ed-live-filters">
        <label htmlFor="prediction-state">State</label>
        <select id="prediction-state" value={state} onChange={(event) => update(event.target.value, '')}>
          <option value="">National only</option>
          {[...stateMapItems].sort((a, b) => a.name.localeCompare(b.name)).map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
        </select>
        <label htmlFor="prediction-district">House district</label>
        <select id="prediction-district" value={district} disabled={!state} onChange={(event) => update(state, event.target.value)}>
          <option value="">All districts</option>
          {Array.from({ length: 53 }, (_, index) => String(index + 1).padStart(2, '0')).map((item) => <option key={item} value={item}>District {item}</option>)}
        </select>
      </div>
      <PredictionMarketsPanel stateCode={state || null} district={state && district ? district : null} />
    </div>
  </main>;
}
