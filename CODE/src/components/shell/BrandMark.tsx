import { Link } from "react-router-dom";

export function BrandMark() {
  return (
    <Link to="/" className="flex min-w-0 items-center gap-3" aria-label="VoteInformed home">
      <span
        className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[10px] border border-signal-teal/40 bg-gradient-to-br from-signal-teal/20 to-signal-teal/5 text-signal-teal"
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-[21px] w-[21px]">
          <path d="M4.5 4.5h15v15h-15z" stroke="currentColor" strokeWidth="1.7" />
          <path d="m8 11 2.7 2.8L16.5 8" stroke="hsl(var(--foreground))" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
        </svg>
      </span>
      <span className="flex min-w-0 items-baseline gap-2">
        <strong className="whitespace-nowrap text-base tracking-wide text-foreground">VoteInformed</strong>
        <span className="font-mono text-xs font-bold tracking-[0.08em] text-signal-teal">2026</span>
      </span>
    </Link>
  );
}
