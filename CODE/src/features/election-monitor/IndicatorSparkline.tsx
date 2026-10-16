import type { IndicatorFrequency } from "./economy";
import { segments } from "./indicatorGaps";
import "./sparkline.css";

/**
 * A small line for an economic series. Unlike the market `Sparkline`, the scale
 * fits the data's own range (it may be negative or far above 100), points are
 * days to quarters apart, and the line is drawn in a neutral colour.
 */
export function IndicatorSparkline({ points, frequency, label, width = 104, height = 22 }: {
  points: Array<[number, number]>;
  frequency: IndicatorFrequency;
  /** For screen readers, e.g. "Unemployment, past 2 years". */
  label: string;
  width?: number;
  height?: number;
}) {
  if (points.length < 2) return null;
  const start = points[0][0];
  const end = points[points.length - 1][0];
  const values = points.map(([, value]) => value);
  let low = Math.min(...values);
  let high = Math.max(...values);
  if (high === low) {
    // A flat line sits in the middle rather than on an edge.
    low -= 1;
    high += 1;
  }
  const pad = 2;
  const x = (t: number) => ((t - start) / (end - start || 1)) * width;
  const y = (value: number) => pad + (1 - (value - low) / (high - low)) * (height - pad * 2);
  const [lastT, lastValue] = points[points.length - 1];

  return (
    <span className="em-spark em-econ-spark">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        <line className="em-spark-axis" x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} />
        {segments(points, frequency).map((segment, index) => segment.length === 1
          ? <circle key={index} cx={x(segment[0][0])} cy={y(segment[0][1])} r={1.25} />
          : <polyline key={index} points={segment.map(([t, value]) => `${x(t).toFixed(1)},${y(value).toFixed(1)}`).join(" ")}
            fill="none" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />)}
        <circle cx={x(lastT)} cy={y(lastValue)} r={2} />
      </svg>
    </span>
  );
}
