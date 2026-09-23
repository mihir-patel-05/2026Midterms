import { AlertCircle, Clock3, DatabaseZap, Loader2, TriangleAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardViewState } from "./types";

const notices: Record<Exclude<DashboardViewState, "ready" | "loading">, { title: string; copy: string; icon: typeof AlertCircle }> = {
  stale: {
    title: "Mock results are stale",
    copy: "Updates are delayed. The last successful fictional snapshot remains visible below and has not been replaced with zeroes.",
    icon: Clock3,
  },
  partial: {
    title: "Partial mock coverage",
    copy: "Some fictional reporting units are intentionally missing so the interface exposes coverage limits.",
    icon: TriangleAlert,
  },
  unavailable: {
    title: "Mock results unavailable",
    copy: "The demonstration source is unavailable. No live or licensed result provider has been configured.",
    icon: DatabaseZap,
  },
};

export function DataStateNotice({ state }: { state: DashboardViewState }) {
  if (state === "ready") return null;

  if (state === "loading") {
    return (
      <div className="ed-state ed-state-loading" role="status" aria-live="polite">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        <div className="w-full">
          <strong>Loading fictional fixture</strong>
          <div className="mt-2 grid gap-2" aria-hidden="true">
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      </div>
    );
  }

  const notice = notices[state];
  const Icon = notice.icon;
  return (
    <div className={`ed-state ed-state-${state}`} role={state === "unavailable" ? "alert" : "status"}>
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <div><strong>{notice.title}</strong><p>{notice.copy}</p></div>
    </div>
  );
}
