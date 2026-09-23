import { Clock3, ExternalLink, FlaskConical } from "lucide-react";
import type { ResponseMetadataContract, SourceStatusContract } from "./types";

function formatTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  }).format(new Date(timestamp));
}

export function SourceFreshnessIndicator({ source, metadata }: { source: SourceStatusContract; metadata: ResponseMetadataContract }) {
  return (
    <section className="ed-panel ed-source" aria-labelledby="source-status-heading">
      <div className="ed-panel-heading">
        <div>
          <span className="ed-eyebrow">Source & freshness</span>
          <h2 id="source-status-heading">Fixture status</h2>
        </div>
        <span className="ed-badge ed-badge-mock"><FlaskConical aria-hidden="true" /> Mock</span>
      </div>
      <dl className="ed-metadata-list">
        <div><dt>Source</dt><dd>{source.name}</dd></div>
        <div><dt>Last updated</dt><dd><Clock3 aria-hidden="true" /> {formatTimestamp(metadata.updatedAt)} ET</dd></div>
        <div><dt>Source health</dt><dd>{source.health}</dd></div>
        <div><dt>Freshness</dt><dd>{metadata.freshness}</dd></div>
        <div><dt>Coverage</dt><dd>{metadata.coverage}</dd></div>
        <div><dt>Response</dt><dd>{metadata.responseStatus}</dd></div>
      </dl>
      <a className="ed-source-link" href={source.url} target="_blank" rel="noreferrer">
        Mock source URL <ExternalLink aria-hidden="true" />
      </a>
      <p className="ed-source-note">This reserved test-domain link is fictional and is present only to exercise the source contract.</p>
    </section>
  );
}
