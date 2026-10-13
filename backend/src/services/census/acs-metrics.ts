/**
 * Derives display metrics from stored ACS estimates, for one area or several
 * combined. Follows the Census Bureau's approximation formulas for margins of
 * error ("Understanding and Using ACS Data", chapter 8):
 *
 * - Sum:   MOE = sqrt(sum of MOE²)
 * - Share: MOE = sqrt(MOE_x² − p² · MOE_y²) / y, using + under the root when the
 *          difference is negative
 *
 * A median cannot be added across areas. For a combined area it is estimated by
 * linear interpolation within the published income brackets and marked
 * `estimated`; metrics with no bracket table are left null for combined areas.
 */
import { ACS_METRICS, type AcsMetric, type AcsTopic } from './acs-variables.js';

export interface AreaValues {
  estimates: Record<string, number | null>;
  moes: Record<string, number | null>;
}

export interface MetricValue {
  key: string;
  label: string;
  topic: AcsTopic;
  /** ACS table the value comes from, for the source line. */
  table: string;
  kind: AcsMetric['kind'];
  /** A count, a share in [0, 1], or dollars for medians. Null when Census published no value. */
  value: number | null;
  /** 90% margin of error in the same unit as `value`, or null when it cannot be computed. */
  moe: number | null;
  /** Coefficient of variation above 30%: shown, but flagged as unreliable. */
  lowReliability: boolean;
  /** For shares, the count behind the share. */
  count?: number | null;
  /** A combined-area median interpolated from brackets rather than published by Census. */
  estimated?: boolean;
  /** The median falls in the open-ended top bracket, so `value` is that bracket's lower bound. */
  topCoded?: boolean;
}

const Z90 = 1.645;
const LOW_RELIABILITY_CV = 0.3;

interface Summed {
  value: number | null;
  moe: number | null;
}

/** Add each variable across areas. One missing estimate makes the total missing, never smaller. */
export function sumAreas(areas: AreaValues[]): AreaValues {
  const estimates: Record<string, number | null> = {};
  const moes: Record<string, number | null> = {};
  const variables = new Set(areas.flatMap((area) => Object.keys(area.estimates)));
  for (const variable of variables) {
    let value: number | null = 0;
    let moeSquares: number | null = 0;
    for (const area of areas) {
      const estimate = area.estimates[variable];
      const moe = area.moes[variable];
      value = value === null || estimate === null || estimate === undefined ? null : value + estimate;
      moeSquares = moeSquares === null || moe === null || moe === undefined ? null : moeSquares + moe * moe;
    }
    estimates[variable] = value;
    moes[variable] = moeSquares === null ? null : Math.sqrt(moeSquares);
  }
  return { estimates, moes };
}

/** Add several variables of one area, e.g. the age lines that make up "18 to 29". */
function sumVars(values: AreaValues, variables: string[]): Summed {
  let value: number | null = 0;
  let moeSquares: number | null = 0;
  for (const variable of variables) {
    const estimate = values.estimates[variable];
    const moe = values.moes[variable];
    value = value === null || estimate === null || estimate === undefined ? null : value + estimate;
    moeSquares = moeSquares === null || moe === null || moe === undefined ? null : moeSquares + moe * moe;
  }
  return { value, moe: moeSquares === null ? null : Math.sqrt(moeSquares) };
}

export function shareOf(numerator: Summed, denominator: Summed): Summed {
  if (numerator.value === null || denominator.value === null || denominator.value <= 0) return { value: null, moe: null };
  const share = numerator.value / denominator.value;
  if (numerator.moe === null || denominator.moe === null) return { value: share, moe: null };
  const difference = numerator.moe ** 2 - share ** 2 * denominator.moe ** 2;
  const radicand = difference >= 0 ? difference : numerator.moe ** 2 + share ** 2 * denominator.moe ** 2;
  return { value: share, moe: Math.sqrt(radicand) / denominator.value };
}

/** Linear interpolation of the median within a bracketed distribution. */
export function medianFromBrackets(
  bins: Array<{ count: number | null; lower: number; upper: number | null }>,
): { value: number | null; topCoded: boolean } {
  if (bins.some((bin) => bin.count === null)) return { value: null, topCoded: false };
  const total = bins.reduce((sum, bin) => sum + (bin.count ?? 0), 0);
  if (total <= 0) return { value: null, topCoded: false };
  const half = total / 2;
  let below = 0;
  for (const bin of bins) {
    const count = bin.count ?? 0;
    if (count > 0 && below + count >= half) {
      if (bin.upper === null) return { value: bin.lower, topCoded: true };
      return { value: bin.lower + ((half - below) / count) * (bin.upper - bin.lower), topCoded: false };
    }
    below += count;
  }
  return { value: null, topCoded: false };
}

function isLowReliability(value: number | null, moe: number | null): boolean {
  if (value === null || moe === null || value <= 0) return false;
  return moe / Z90 / value > LOW_RELIABILITY_CV;
}

const round = (value: number | null, digits: number) =>
  value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits;

/**
 * Metrics for the given areas taken together. With one area, published medians
 * are used as-is; with several, medians are interpolated or left null.
 */
export function computeMetrics(areas: AreaValues[], metrics: AcsMetric[] = ACS_METRICS): MetricValue[] {
  const totals = areas.length === 1 ? areas[0] : sumAreas(areas);
  return metrics.map((metric): MetricValue => {
    const base = { key: metric.key, label: metric.label, topic: metric.topic, table: metric.table, kind: metric.kind };
    if (areas.length === 0) return { ...base, value: null, moe: null, lowReliability: false };

    if (metric.kind === 'count') {
      const { value, moe } = sumVars(totals, metric.vars);
      return { ...base, value, moe: round(moe, 0), lowReliability: isLowReliability(value, moe) };
    }

    if (metric.kind === 'share') {
      const numerator = sumVars(totals, metric.numerator);
      const { value, moe } = shareOf(numerator, sumVars(totals, metric.denominator));
      return {
        ...base,
        value: round(value, 4),
        moe: round(moe, 4),
        lowReliability: isLowReliability(value, moe),
        count: numerator.value,
      };
    }

    if (areas.length === 1) {
      const value = totals.estimates[metric.variable] ?? null;
      const moe = totals.moes[metric.variable] ?? null;
      return { ...base, value, moe, lowReliability: isLowReliability(value, moe) };
    }
    if (!metric.brackets) return { ...base, value: null, moe: null, lowReliability: false };
    const { value, topCoded } = medianFromBrackets(metric.brackets.bins.map((bin) => ({
      count: totals.estimates[bin.variable] ?? null,
      lower: bin.lower,
      upper: bin.upper,
    })));
    return { ...base, value: round(value, 0), moe: null, lowReliability: false, estimated: true, ...(topCoded ? { topCoded } : {}) };
  });
}
