import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis, type DotProps } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { buildTiles, useEconIndicators, type ChartSeries, type EconTile } from "./economy";
import { axisDate, HISTORY_RANGES, historyRows, inRange, periodText, type HistoryRange, type HistoryRow } from "./indicatorHistory";

/** The 5-year backfill; 1Y and 2Y are cut from it on the client. */
const HISTORY_DAYS = 1825;

type LineKey = "main" | "us";

interface LineSpec {
  key: LineKey;
  name: string;
  /** The U.S. line is dashed, so the two never differ by shade alone. */
  dashed: boolean;
}

// Neutral inks: red and blue mean parties on the monitor. The U.S. line is lighter and dashed.
const COLORS: Record<LineKey, string> = { main: "hsl(var(--foreground))", us: "hsl(var(--muted-foreground))" };

/** A point with no neighbour on either side would vanish with dot={false}; draw it. */
function isolatedDot(rows: HistoryRow[], key: LineKey) {
  return function Dot(props: DotProps & { index?: number }) {
    const { cx, cy, index = -1 } = props;
    const value = rows[index]?.[key];
    const near = (offset: number) => rows[index + offset]?.[key] != null;
    if (value == null || cx == null || cy == null || near(-1) || near(1)) return <g key={`${key}-${index}`} />;
    return <circle key={`${key}-${index}`} cx={cx} cy={cy} r={3} fill={COLORS[key]} />;
  };
}

interface TipProps {
  active?: boolean;
  label?: number;
  payload?: Array<{ dataKey?: string | number; value?: number | null }>;
  lines: LineSpec[];
  series: ChartSeries;
}

function HistoryTip({ active, label, payload, lines, series }: TipProps) {
  const shown = (payload ?? []).filter((item) => item.value != null);
  if (!active || label == null || shown.length === 0) return null;
  return (
    <div className="em-econ-chart-tip">
      <p className="em-econ-chart-tip-period">{periodText(label, series.frequency)}</p>
      {shown.map((item) => {
        const line = lines.find((spec) => spec.key === item.dataKey);
        return line && (
          <p key={line.key}>
            <span className="em-econ-swatch" data-dashed={line.dashed || undefined} aria-hidden="true" />
            {line.name}: <strong>{series.format(item.value!)}</strong>
          </p>
        );
      })}
    </div>
  );
}

function HistoryChart({ rows, lines, series, label, height }: {
  rows: HistoryRow[];
  lines: LineSpec[];
  /** Formats the axis and tooltip; the lines in one chart share a unit. */
  series: ChartSeries;
  label: string;
  height: number;
}) {
  const config = Object.fromEntries(lines.map((line) => [line.key, { label: line.name, color: COLORS[line.key] }])) satisfies ChartConfig;
  if (rows.length < 2) return <p className="em-econ-chart-empty">Not enough history in this range.</p>;
  return (
    <ChartContainer config={config} className="em-econ-chart aspect-auto" style={{ height }} role="img" aria-label={label}>
      <LineChart data={rows} margin={{ top: 8, right: 14, bottom: 0, left: 4 }}>
        <CartesianGrid vertical={false} className="em-econ-grid" />
        <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={axisDate}
          tickLine={false} axisLine={false} minTickGap={36} tickMargin={6} />
        <YAxis tickFormatter={series.format} tickLine={false} axisLine={false} width={58} domain={["auto", "auto"]} tickCount={5} />
        <ChartTooltip cursor={{ strokeWidth: 1 }} isAnimationActive={false}
          content={<HistoryTip lines={lines} series={series} />} />
        {lines.map((line) => (
          <Line key={line.key} dataKey={line.key} name={line.name} type="linear" stroke={COLORS[line.key]} strokeWidth={2}
            strokeDasharray={line.dashed ? "5 4" : undefined} strokeLinejoin="round" strokeLinecap="round"
            dot={isolatedDot(rows, line.key)} activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--surface))" }}
            connectNulls={false} isAnimationActive={false} />
        ))}
      </LineChart>
    </ChartContainer>
  );
}

/** The points as a table, newest first: the chart's accessible alternative. */
function HistoryTable({ rows, lines, series }: { rows: HistoryRow[]; lines: LineSpec[]; series: ChartSeries }) {
  const filled = rows.filter((row) => lines.some((line) => row[line.key] != null)).reverse();
  return (
    <details className="em-econ-table">
      <summary>Data table</summary>
      <div className="em-econ-table-scroll">
        <table>
          <thead>
            <tr><th scope="col">Period</th>{lines.map((line) => <th key={line.key} scope="col">{line.name}</th>)}</tr>
          </thead>
          <tbody>
            {filled.map((row) => (
              <tr key={row.t}>
                <th scope="row">{periodText(row.t, series.frequency)}</th>
                {lines.map((line) => <td key={line.key}>{row[line.key] == null ? "–" : series.format(row[line.key]!)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Legend({ lines, latest }: { lines: LineSpec[]; latest: Partial<Record<LineKey, string>> }) {
  return (
    <ul className="em-econ-legend">
      {lines.map((line) => (
        <li key={line.key}>
          <span className="em-econ-swatch" data-dashed={line.dashed || undefined} aria-hidden="true" />
          {line.name}{latest[line.key] && <strong>{latest[line.key]}</strong>}
        </li>
      ))}
    </ul>
  );
}

const lastValue = (points: Array<[number, number]>, format: (value: number) => string) => (points.length ? format(points[points.length - 1][1]) : undefined);

/**
 * A larger history chart for one economy tile. With a state selected, the state
 * is set against the U.S.: on one axis when the two are the same kind of number
 * (rates, growth, index changes), or as two charts when their sizes are not
 * comparable (jobs, claims). Never two y-scales on one chart.
 */
export default function IndicatorHistoryDialog({ tile: clicked, stateCode, stateName, open, onOpenChange, returnFocusTo }: {
  /** The tile as the strip shows it; stands in until the 5-year history arrives. */
  tile: EconTile;
  stateCode: string | null;
  stateName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The tile that opened the dialog; focus goes back to it on close. */
  returnFocusTo: HTMLElement | null;
}) {
  const [range, setRange] = useState<HistoryRange>("2Y");
  const { data, isPlaceholderData } = useEconIndicators(HISTORY_DAYS, stateCode);
  const tile = useMemo(
    () => (data && !isPlaceholderData ? buildTiles(data).find((item) => item.id === clicked.id) : undefined) ?? clicked,
    [data, isPlaceholderData, clicked],
  );
  const asOf = data && !isPlaceholderData ? Date.parse(data.asOf) : Date.now();

  const scopeName = tile.scope === "state" ? stateName ?? stateCode ?? "State" : "United States";
  const chart = tile.chart;
  const comparison = tile.comparison;
  const mainPoints = chart ? inRange(chart.points, asOf, range) : [];
  const usPoints = comparison ? inRange(comparison.points, asOf, range) : [];
  const rangeLabel = HISTORY_RANGES.find((item) => item.value === range)!.label;

  const mainLine: LineSpec = { key: "main", name: scopeName, dashed: false };
  const usLine: LineSpec = { key: "us", name: "United States", dashed: true };
  // On its own chart the U.S. is the only line, so it is drawn like any single series.
  const usAlone: LineSpec = { key: "main", name: "United States", dashed: false };

  let body: JSX.Element;
  if (!chart) {
    body = <p className="em-econ-chart-empty">No history is available from FRED for this series yet.</p>;
  } else if (comparison?.mode === "overlay") {
    const rows = historyRows({ points: mainPoints, frequency: chart.frequency }, { points: usPoints, frequency: comparison.frequency });
    const lines = [mainLine, usLine];
    body = (
      <>
        <Legend lines={lines} latest={{ main: lastValue(mainPoints, chart.format), us: lastValue(usPoints, comparison.format) }} />
        <HistoryChart rows={rows} lines={lines} series={chart} height={260} label={`${tile.label}, ${scopeName} and the United States, past ${rangeLabel}`} />
        <HistoryTable rows={rows} lines={lines} series={chart} />
      </>
    );
  } else if (comparison) {
    const stateRows = historyRows({ points: mainPoints, frequency: chart.frequency });
    const usRows = historyRows({ points: usPoints, frequency: comparison.frequency });
    body = (
      <>
        <h3 className="em-econ-chart-title">{scopeName}</h3>
        <HistoryChart rows={stateRows} lines={[mainLine]} series={chart} height={180} label={`${tile.label}, ${scopeName}, past ${rangeLabel}`} />
        <HistoryTable rows={stateRows} lines={[mainLine]} series={chart} />
        <h3 className="em-econ-chart-title">United States</h3>
        <HistoryChart rows={usRows} lines={[usAlone]} series={comparison} height={180} label={`${tile.label}, United States, past ${rangeLabel}`} />
        <HistoryTable rows={usRows} lines={[usAlone]} series={comparison} />
      </>
    );
  } else {
    const rows = historyRows({ points: mainPoints, frequency: chart.frequency });
    body = (
      <>
        <HistoryChart rows={rows} lines={[mainLine]} series={chart} height={260} label={`${tile.label}, ${scopeName}, past ${rangeLabel}`} />
        <HistoryTable rows={rows} lines={[mainLine]} series={chart} />
      </>
    );
  }

  // The state and U.S. figures usually share an agency and fetch date.
  const sources = [...new Set([chart?.source, comparison?.source].filter((line): line is string => Boolean(line)))];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="em-econ-dialog max-w-2xl"
        onCloseAutoFocus={(event) => {
          if (!returnFocusTo?.isConnected) return;
          event.preventDefault();
          returnFocusTo.focus();
        }}>
        <DialogHeader className="em-econ-dialog-head text-left sm:text-left">
          <DialogTitle>{tile.label}</DialogTitle>
          <DialogDescription>
            {scopeName}{tile.period ? ` · ${tile.period}` : ""}{chart ? ` · ${chart.unit}` : ""}
          </DialogDescription>
          <div className="em-econ-figures">
            <strong className="em-econ-dialog-value">{tile.value}</strong>
            {tile.change && <span className="em-econ-change">{tile.change.text} {tile.change.basis}</span>}
            {tile.stale && <span className="em-pill" data-tone="amber">Stale</span>}
          </div>
        </DialogHeader>

        <ToggleGroup type="single" size="sm" variant="outline" className="em-econ-ranges justify-start" value={range}
          aria-label="Time range" onValueChange={(value) => value && setRange(value as HistoryRange)}>
          {HISTORY_RANGES.map((item) => (
            <ToggleGroupItem key={item.value} value={item.value} aria-label={item.label}>{item.value}</ToggleGroupItem>
          ))}
        </ToggleGroup>

        <div className="em-econ-dialog-body">{body}</div>

        <footer className="em-econ-dialog-foot">
          {sources.map((line) => <p key={line}>{line}</p>)}
          {tile.scope === "state" && tile.id === "claims" && <p>State claims are not seasonally adjusted, so they swing with the seasons.</p>}
          <p>Economic data via FRED (Federal Reserve Bank of St. Louis). Shown for context, not as a forecast or an explanation of market odds.</p>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
