import type { ReactNode } from "react";
import { formatEtTime } from "./constants";

export interface ActivityItem {
  at: string;
  tone: "teal" | "blue" | "amber" | "danger";
  title: string;
  detail: string;
}

export interface CoverageItem {
  label: string;
  /** 0–1, or null when the measure does not apply yet. */
  ratio: number | null;
  note?: string;
}

const toneVar = { teal: "--signal-teal", blue: "--signal-blue", amber: "--signal-amber", danger: "--signal-danger" } as const;

export function ActivityRail({ activity, coverage, coverageScope, children }: {
  activity: ActivityItem[];
  coverage: CoverageItem[];
  coverageScope: string;
  children?: ReactNode;
}) {
  return (
    <div className="em-rail">
      <section className="em-rail-card" aria-labelledby="em-activity-heading">
        <div className="em-rail-head"><h2 id="em-activity-heading">Latest source activity</h2><span>This session</span></div>
        {activity.length === 0 ? <p className="em-rail-empty">Waiting for the first data load…</p> : (
          <ol className="em-activity" aria-live="polite">
            {activity.map((item) => (
              <li key={`${item.title}-${item.at}`}>
                <time dateTime={item.at}>{formatEtTime(item.at)}</time>
                <i style={{ background: `hsl(var(${toneVar[item.tone]}))` }} aria-hidden="true" />
                <p><strong>{item.title}.</strong> {item.detail}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="em-rail-card" aria-labelledby="em-coverage-heading">
        <div className="em-rail-head"><h2 id="em-coverage-heading">Data coverage</h2><span>{coverageScope}</span></div>
        <div className="em-coverage">
          {coverage.map((item) => (
            <div className="em-coverage-row" key={item.label}>
              <span>{item.label}</span>
              {item.ratio === null
                ? <em>{item.note ?? "n/a"}</em>
                : <div className="em-bar" role="meter" aria-label={item.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(item.ratio * 100)}><span style={{ width: `${item.ratio * 100}%` }} /></div>}
              <strong>{item.ratio === null ? "" : `${Math.round(item.ratio * 100)}%`}</strong>
            </div>
          ))}
        </div>
      </section>

      {children && <div className="em-rail-wide">{children}</div>}
    </div>
  );
}
