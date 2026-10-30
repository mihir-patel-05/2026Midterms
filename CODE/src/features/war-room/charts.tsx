import type { HistoryPoint } from "@/features/election-monitor/marketHistory";
import { priceRange, tracePolylines } from "./trace";

export interface TraceSeries {
  key: string;
  label: string;
  color: string;
  points: HistoryPoint[];
}

/**
 * A price chart that stretches to its box. Lines keep their width (non-scaling strokes) and the axis labels are
 * HTML, so neither distorts. Gaps in the stored history stay gaps.
 */
export function PriceTrace({ series, domain, label, range, guides = [], marker, height = 200 }: {
  series: TraceSeries[];
  domain: [number, number];
  /** What the chart shows, in words, for screen readers. */
  label: string;
  range?: [number, number];
  /** Horizontal lines at these prices, labelled at the right edge. */
  guides?: number[];
  /** A dashed vertical line at this time, with a caption. */
  marker?: { at: number; text: string };
  height?: number;
}) {
  const W = 640;
  const H = 200;
  const scale = range ?? priceRange(series.map((item) => item.points));
  const [low, high] = scale;
  const y = (value: number) => (1 - (value - low) / (high - low || 1)) * 100;
  const markerX = marker ? ((marker.at - domain[0]) / (domain[1] - domain[0] || 1)) * 100 : null;
  return (
    <div className="wr-trace" style={{ height }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height="100%" role="img" aria-label={label}>
        {guides.map((value) => (
          <line key={value} x1={0} x2={W} y1={(y(value) / 100) * H} y2={(y(value) / 100) * H} className="wr-trace-guide" data-even={value === 50 || undefined} vectorEffect="non-scaling-stroke" />
        ))}
        {markerX !== null && markerX >= 0 && markerX <= 100 && (
          <line x1={(markerX / 100) * W} x2={(markerX / 100) * W} y1={0} y2={H} className="wr-trace-marker" vectorEffect="non-scaling-stroke" />
        )}
        {series.map((item) => tracePolylines(item.points, domain, scale, W, H).map((points, index) => (
          <polyline key={`${item.key}-${index}`} points={points} fill="none" stroke={item.color} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        )))}
      </svg>
      {guides.map((value) => <span key={value} className="wr-trace-label" style={{ top: `calc(${y(value)}% - 14px)` }} aria-hidden="true">{value}¢</span>)}
      {marker && markerX !== null && markerX >= 0 && markerX <= 100 && (
        <span className="wr-trace-caption" style={{ left: `calc(${markerX}% + 6px)` }} aria-hidden="true">{marker.text}</span>
      )}
    </div>
  );
}

/** A small fixed-size line for a table row. */
export function Spark({ points, domain, color, width = 72, height = 18 }: { points: HistoryPoint[]; domain: [number, number]; color: string; width?: number; height?: number }) {
  const lines = tracePolylines(points, domain, priceRange([points], 10), width, height - 2);
  if (lines.length === 0) return <span className="wr-spark-empty" aria-hidden="true">—</span>;
  return (
    <svg width={width} height={height} viewBox={`0 -1 ${width} ${height}`} aria-hidden="true" focusable="false">
      {lines.map((points, index) => <polyline key={index} points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />)}
    </svg>
  );
}
