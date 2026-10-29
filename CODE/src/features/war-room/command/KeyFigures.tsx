import { numberFormat } from "@/features/election-monitor/constants";
import { etClock } from "../countdown";
import { leadersUnder } from "../seatTally";
import type { Board } from "../useBoard";

const DASH = "–";

/** Six national figures. Each reads "–" until its source answers, never 0. */
export function KeyFigures({ board, races }: { board: Board; races: number | null }) {
  const { senate, house } = board;
  const both = senate && house;
  const lastTick = [senate?.lastChange, house?.lastChange].filter((at): at is string => Boolean(at)).sort().pop();
  const cells: Array<{ label: string; value: string; note?: string; tone?: "live" | "accent" }> = [
    { label: "Races on file", value: races === null ? DASH : numberFormat.format(races), note: "FEC, 2026 general" },
    { label: "Markets live", value: board.marketCount === null ? DASH : numberFormat.format(board.marketCount), tone: "live", note: "Kalshi outcomes" },
    { label: "Races priced", value: both ? numberFormat.format(senate.priced + house.priced) : DASH, note: "Senate + House" },
    { label: "Flip watch", value: both ? `${senate.flips.size} · ${house.flips.size}` : DASH, tone: "accent", note: "Sen · House" },
    { label: "Under 60¢", value: both ? `${leadersUnder(senate, 60)} · ${leadersUnder(house, 60)}` : DASH, note: "Sen · House leader" },
    { label: "Last tick", value: lastTick ? etClock(Date.parse(lastTick)) : DASH, note: "ET" },
  ];
  return (
    <section className="wr-panel wr-figures" aria-label="Key figures" data-flush>
      <dl>
        {cells.map((cell) => (
          <div key={cell.label}>
            <dt>{cell.label}</dt>
            <dd data-tone={cell.tone}>{cell.value}</dd>
            {cell.note && <dd className="wr-figure-note">{cell.note}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}
