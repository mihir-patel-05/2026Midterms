import type { ReactNode } from "react";
import { Badge, Panel } from "./Panel";

/** An outside source we don't have yet, named, as the monitor's coverage rail does ("No provider connected"). */
export function NotConnectedPanel({ title, source, description, id, children }: {
  title: string;
  /** Who would supply it: "Licensed results provider", "YouTube stream IDs". */
  source: string;
  description: string;
  id?: string;
  /** Real figures that do exist alongside, like poll closings. */
  children?: ReactNode;
}) {
  return (
    <Panel id={id} title={title} meta={<Badge tone="off">Not connected</Badge>} className="wr-off">
      <p className="wr-off-source">Not connected · {source}</p>
      <p className="wr-off-copy">{description}</p>
      {children}
    </Panel>
  );
}
