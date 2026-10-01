import { mockResultsProviderEnabled } from "@/lib/featureFlags";

/**
 * Shown site-wide whenever fictional results fixtures are enabled, so mock vote
 * totals can never be mistaken for real election information.
 */
export function DataBanner() {
  if (!mockResultsProviderEnabled) return null;
  return (
    <div role="note" className="border-b border-signal-amber/30 bg-signal-amber/10 px-4 py-2 text-center text-[0.82rem] text-signal-amber">
      <strong>Mock results:</strong> vote totals, reporting percentages and result updates are fictional fixtures. Candidate and finance data come from the FEC.
    </div>
  );
}
