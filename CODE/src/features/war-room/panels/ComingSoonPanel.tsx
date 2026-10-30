import { Badge, Panel } from "./Panel";

/**
 * A feature that isn't built yet. It keeps its place in the grid so nothing shifts when it lands, and shows no
 * placeholder bars or figures: only what it will show.
 */
export function ComingSoonPanel({ title, description, id }: { title: string; description: string; id?: string }) {
  return (
    <Panel id={id} title={title} meta={<Badge tone="soon">Coming soon</Badge>} flush className="wr-soon">
      <div className="wr-soon-body">
        <p>{description}</p>
        <p className="wr-soon-note">In development · no figures until it ships</p>
      </div>
    </Panel>
  );
}
