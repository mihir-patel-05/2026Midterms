import { useId, type ReactNode } from "react";

export interface PanelProps {
  title: ReactNode;
  /** Right side of the heading row: a source, a count, or controls. */
  meta?: ReactNode;
  /** Targeting brackets on all four corners, or the top two only. */
  brackets?: boolean | "top";
  /** Lists and tables run edge to edge under a ruled heading; other panels are padded with the heading inline. */
  flush?: boolean;
  /** A stronger frame, for the panel the page is about (the target card, the dossier header). */
  strong?: boolean;
  /** One line under the body: sources, method, caveats. */
  footnote?: ReactNode;
  id?: string;
  className?: string;
  children?: ReactNode;
}

/** The War Room panel frame. Every panel is a labelled section, so screen readers can jump between them. */
export function Panel({ title, meta, brackets = false, flush = false, strong = false, footnote, id, className, children }: PanelProps) {
  const headingId = useId();
  return (
    <section id={id} className={`wr-panel${className ? ` ${className}` : ""}`} aria-labelledby={headingId}
      data-flush={flush || undefined} data-strong={strong || undefined}>
      {brackets && <Brackets top={brackets === "top"} />}
      <div className="wr-panel-head">
        <h2 id={headingId} className="wr-panel-title">{title}</h2>
        {meta && <div className="wr-panel-meta">{meta}</div>}
      </div>
      {children}
      {footnote && <p className="wr-panel-foot">{footnote}</p>}
    </section>
  );
}

/** Amber corner brackets, the War Room's mark for "this is the selection". */
export function Brackets({ top = false }: { top?: boolean }) {
  return (
    <>
      <span className="wr-brk" data-corner="tl" aria-hidden="true" />
      <span className="wr-brk" data-corner="tr" aria-hidden="true" />
      {!top && <span className="wr-brk" data-corner="bl" aria-hidden="true" />}
      {!top && <span className="wr-brk" data-corner="br" aria-hidden="true" />}
    </>
  );
}

/** Loading or unavailable, in words. Never a zero standing in for missing data. */
export function StatusLine({ children, tone }: { children: ReactNode; tone?: "warn" }) {
  return <p className="wr-status" role="status" data-tone={tone}>{children}</p>;
}

export function Badge({ children, tone }: { children: ReactNode; tone?: "soon" | "off" | "live" | "accent" | "mock" }) {
  return <span className="wr-badge" data-tone={tone}>{children}</span>;
}
