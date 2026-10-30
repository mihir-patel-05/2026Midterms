/** Stroke icons for the War Room rail and controls, drawn in currentColor. All are decorative. */
const paths = {
  command: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2" /><path d="M12 1v5M12 18v5M1 12h5M18 12h5" /></>,
  map: <><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" /><path d="M9 3v15M15 6v15" /></>,
  races: <><rect x="4" y="3" width="16" height="18" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  markets: <><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></>,
  money: <><rect x="2" y="6" width="20" height="12" /><circle cx="12" cy="12" r="3" /><path d="M6 9v6M18 9v6" /></>,
  econ: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  past: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
  sim: <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>,
  news: <><rect x="3" y="4" width="15" height="16" /><path d="M18 8h3v10a2 2 0 0 1-2 2H5M6 8h9M6 12h9M6 16h5" /></>,
  night: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, strokeWidth = 1.6 }: { name: IconName; size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}

/** The War Room mark: a crosshair in the accent colour. */
export function Mark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true" focusable="false">
      <circle cx="14" cy="14" r="9" stroke="var(--wr-accent)" strokeWidth="1.5" />
      <circle cx="14" cy="14" r="2.5" fill="var(--wr-accent)" />
      <path d="M14 1v6M14 21v6M1 14h6M21 14h6" stroke="var(--wr-accent)" strokeWidth="1.5" />
    </svg>
  );
}
