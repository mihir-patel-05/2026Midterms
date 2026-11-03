import { Link } from "react-router-dom";
import { warRoomEnabled } from "@/lib/featureFlags";
import { LIVE_LINK_ENDS, resultsAreLive } from "@/features/war-room/electionNight";
import { useNow } from "@/features/war-room/useNow";

/**
 * A site-wide link to the War Room's Night screen, where election night lives (results, race calls, poll closings,
 * network streams). Before the first polls close it says when they do; after, it says results are live. It goes away
 * once results stop being "live", and never shows in a build without the War Room.
 */
export function WarRoomBanner() {
  const now = useNow(60_000);
  if (!warRoomEnabled || now >= LIVE_LINK_ENDS) return null;
  const live = resultsAreLive(now);
  return (
    <div role="note" className="border-b border-signal-teal/30 bg-signal-teal/10 px-4 py-2 text-center text-[0.82rem] text-foreground">
      {live ? (
        <>
          <i className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-signal-teal align-middle" aria-hidden="true" />
          <strong>Election night is live.</strong> Results, race calls and network streams are in the War Room.{" "}
        </>
      ) : (
        <>
          <strong>Election night:</strong> the first polls close at 6 PM ET on Nov 3. Follow results, race calls and network streams in the War Room.{" "}
        </>
      )}
      <Link to="/war-room/night" className="font-semibold text-signal-teal underline underline-offset-2 hover:no-underline">
        {live ? "Open live results" : "Open the War Room"}
      </Link>
    </div>
  );
}
