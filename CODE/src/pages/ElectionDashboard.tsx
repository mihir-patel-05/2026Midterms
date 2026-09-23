import { Link } from "react-router-dom";
import { DatabaseZap, Flag } from "lucide-react";
import { ElectionDashboardShell } from "@/features/election-dashboard/ElectionDashboardShell";

const dashboardEnabled = import.meta.env.VITE_FEATURE_ELECTION_DASHBOARD === "true";
const mockProviderEnabled = import.meta.env.VITE_RESULTS_PROVIDER_MOCK_ENABLED === "true";

export default function ElectionDashboard() {
  if (dashboardEnabled && mockProviderEnabled) return <ElectionDashboardShell />;

  return (
    <main className="min-h-screen bg-background px-6 py-20 text-foreground">
      <div className="mx-auto max-w-xl rounded-xl border border-border bg-card p-8 text-center shadow-lg">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {dashboardEnabled ? <DatabaseZap aria-hidden="true" /> : <Flag aria-hidden="true" />}
        </div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Election dashboard beta</p>
        <h1 className="mt-2 text-2xl font-bold">{dashboardEnabled ? "Mock result source unavailable" : "Feature not enabled"}</h1>
        <p className="mt-3 text-muted-foreground">
          {dashboardEnabled
            ? "The dashboard shell is enabled, but its fictional local fixture provider is disabled. No live provider is configured."
            : "This beta route is protected by a feature flag and is not available in this environment."}
        </p>
        <Link className="mt-6 inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 font-semibold text-primary-foreground" to="/elections">
          Return to elections
        </Link>
      </div>
    </main>
  );
}
