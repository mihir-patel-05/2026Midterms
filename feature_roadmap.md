# VoteInformed Feature Roadmap

Last updated: July 16, 2026  
Status: Proposed implementation plan  
Product: VoteInformed 2026 federal midterm election platform

## 1. Purpose

VoteInformed is a nonpartisan election-information platform that helps voters discover federal races, understand candidates, inspect campaign funding and incumbent ideology, and reach official voting resources. It also contains a gated researcher portal for historical county results and election simulations, plus an administrative application for data synchronization and deadline management.

The next product stage should turn the platform from an election-data browser into a complete voter decision workflow:

1. Identify the races and voting rules that apply to the user.
2. Compare candidates using documented evidence.
3. Understand campaign funding and outside influence.
4. Build a voting plan and receive useful reminders.
5. Return to see what has changed.

This roadmap describes the prerequisites and implementation plan for thirteen proposed feature areas. Estimates are directional engineering ranges, not delivery commitments.

## 2. Current technical foundation

The roadmap assumes the current repository structure:

- Public frontend: React 18, TypeScript, Vite, React Router, TanStack Query, Tailwind, shadcn/ui, and Recharts under `CODE/`.
- Backend: Node.js, Express, TypeScript, Zod, Prisma, and PostgreSQL under `backend/`.
- Admin frontend: React and Vite under `admin-dashboard/`.
- Existing data: candidates, elections, candidate-election relationships, FEC financial totals, committees, itemized receipts and disbursements, ideology scores, deadlines, county results, researcher accounts, and saved-simulation scaffolding.
- Existing integrations: FEC, GovTrack-derived data, MIT Election Lab imports, Gemini chat, and state/official voter-resource links.

New code should follow the existing controller/service/route split, validate all API input with Zod, use Prisma migrations for persistence, and use TanStack Query for server state in the frontend.

## 3. Product and engineering principles

Every feature in this roadmap should follow these rules:

- Nonpartisan presentation: apply the same data requirements, labels, ordering rules, and missing-data states to every candidate and party.
- Evidence before interpretation: distinguish source facts, VoteInformed calculations, campaign-provided claims, and model-generated summaries.
- Field-level provenance: important claims must show their source, publication date, retrieval date, and current freshness.
- Privacy by default: do not store a voter's street address unless the user explicitly opts into an account feature that requires it. Prefer transient address resolution and store district identifiers instead.
- Accessible by default: target WCAG 2.1 AA, keyboard navigation, screen-reader labels, visible focus, sufficient contrast, and text alternatives for every visualization.
- Calendar-date safety: election and deadline dates must remain local calendar dates rather than being shifted through browser time zones.
- Progressive disclosure: show a clear summary first and expose source records, methodology, and advanced analysis on demand.
- Graceful incompleteness: say “not verified” or “not available” instead of inferring a position, ballot status, or result.
- Auditable editorial changes: reviewed content and corrections must retain actor, timestamp, reason, and previous value.
- Measurable releases: each feature must define analytics events and success indicators before rollout.

## 4. Foundation work before major feature development

These items close visible gaps in the current experience and create reliable inputs for later features.

### 4.1 Complete primary-election support

The current UI can filter primary versus general elections, but primary coverage is incomplete.

Implementation:

1. Add primary metadata to `Election`: primary type, party, runoff relationship, official source URL, filing deadline, and verification status.
2. Update election ingestion to use official state election-office sources rather than generating every election solely from FEC candidate records.
3. Add an admin verification queue for unconfirmed candidate ballot status.
4. Represent candidates who filed with the FEC but are not confirmed for the ballot separately from confirmed candidates.
5. Add unit tests for closed, open, top-two, top-four, nonpartisan, and runoff primary formats.
6. Remove “coming soon” UI only after state data has an explicit freshness and verification state.

Acceptance criteria:

- Primary and general tabs show independently verified candidate lists.
- The UI identifies the primary format and eligibility rules.
- Unverified FEC filers cannot be mistaken for confirmed ballot candidates.

### 4.2 Build a state voting-rules dataset

State-specific rules are required by My Ballot, alerts, and the voting-plan experience.

Implementation:

1. Add `StateVotingRule`, `VotingMethodWindow`, and `OfficialResourceLink` models.
2. Cover registration methods and deadlines, voter ID, early voting, absentee eligibility and request deadlines, ballot-return rules, restoration rules, accessibility, and language assistance.
3. Require an official source URL, effective date, last verified date, and reviewer for every rule.
4. Add admin forms with a review/publish workflow and scheduled stale-content warnings.
5. Expose `GET /api/voting-rules/:state` with current rules and sources.
6. Replace generic descriptions in the voter-resources page with state-specific content.

Acceptance criteria:

- Every state page displays sourced, dated rules or an explicit coverage warning.
- Expired rules are hidden from the public API and flagged for administrators.

### 4.3 Add a reusable source and provenance system

The data trust feature needs to be foundational rather than retrofitted separately into every table.

Implementation:

1. Add a generic `SourceRecord` model with publisher, URL, source type, published date, retrieved date, checksum, archival URL, and license notes.
2. Add `FieldEvidence` or domain-specific join tables that connect a source to a record and field/claim.
3. Store the extraction method: automated import, manual entry, campaign submission, or derived calculation.
4. Add `ContentRevision` and `CorrectionReport` models for change history and user-reported errors.
5. Build shared frontend components: `SourceLink`, `FreshnessBadge`, `CoverageNotice`, and `RevisionHistory`.
6. Define source-retention and broken-link monitoring jobs.

### 4.4 Complete saved simulation persistence

The `SavedSimulation` model exists, but the public API and researcher UI do not use it.

Implementation:

1. Add authenticated list, create, update, duplicate, and delete endpoints under `/api/research/simulations`.
2. Persist the full versioned scenario input, baseline dataset version, model version, and output summary.
3. Add a Saved Scenarios screen and a save action in the simulator.
4. Prevent a saved scenario from silently changing when historical data or model logic changes; require an explicit rerun.
5. Add authorization tests ensuring researchers can access only their own private scenarios.

### 4.5 Finish planned lobby-analysis improvements

Implementation:

1. Precompute candidate/lobby aggregates during finance synchronization.
2. Add lobby filters and rankings to the candidate directory.
3. Add contextual lobby badges to candidate cards, using neutral descriptive language.
4. Add a review tool for false-positive and false-negative classification examples.
5. Version the lobby taxonomy and show the taxonomy version in API responses.

## 5. Shared platform capabilities

Several proposed features depend on the same infrastructure. Building these once will reduce duplicated logic.

### 5.1 Optional voter accounts and anonymous mode

Public election research must remain usable without an account. Accounts are needed only for cross-device watchlists, saved comparisons, reminder delivery, and preferences.

Recommended models:

- `VoterUser`: email, verified status, locale, time zone, consent timestamps, and notification preferences.
- `VoterSession`: hashed token, expiration, last used timestamp, and device metadata with a short retention period.
- `UserDistrictPreference`: state, congressional district, optional jurisdiction identifiers, and resolution timestamp. Do not store the original address by default.
- `ConsentRecord`: consent type, policy version, timestamp, and revocation timestamp.

Anonymous users should be able to save state, district, comparisons, and voting-plan data in local storage, then explicitly migrate it into an account.

### 5.2 Background jobs and event delivery

The existing scheduler is appropriate for FEC synchronization but alerts and feeds need a durable job system before production scale.

Implementation direction:

1. Add a PostgreSQL-backed job table for an initial release or introduce a dedicated queue when volume requires it.
2. Define idempotency keys for ingestion, feed-event generation, and notification delivery.
3. Add retry count, next attempt, terminal failure, and dead-letter state.
4. Separate data ingestion from notification fan-out.
5. Record provider response IDs without logging message bodies or sensitive voter inputs.

### 5.3 Feature flags and analytics

1. Add server-controlled feature flags by environment and optional percentage rollout.
2. Define privacy-preserving events such as `ballot_lookup_completed`, `comparison_created`, `source_opened`, `voting_plan_created`, `watch_added`, and `official_resource_clicked`.
3. Do not send street addresses, names, email addresses, chat text, or freeform correction details to analytics.
4. Create an admin product-health view showing coverage and freshness alongside engagement.

### 5.4 API response conventions

New endpoints should return:

- `data`: the requested resource.
- `meta.generatedAt`: response generation timestamp.
- `meta.sources`: relevant source summaries.
- `meta.freshness`: fresh, aging, stale, or unknown.
- `meta.coverage`: complete, partial, unavailable, or unverified.
- A stable error envelope with machine-readable `code`, user-safe `message`, and optional validation `issues`.

## 6. Feature 1: My Ballot and Voting Plan

### User outcome

A voter enters an address or ZIP code and receives the federal races that apply to them, their official registration and voting resources, deadlines, and a printable action checklist.

### Scope

Initial scope should include U.S. House and Senate contests, state voting rules, registration status links, early voting, absentee voting, voter ID, and election dates. State and local contests can be added later after authoritative data contracts exist.

### Data and integration plan

1. Select an address-to-district provider with a clear election-use license and availability SLA. Keep provider access behind a `DistrictResolver` interface so it can be replaced.
2. Normalize and validate addresses on the backend. Send the address directly to the selected provider over TLS and discard it after resolution.
3. Resolve at minimum state, congressional district, and confidence/match quality.
4. Join resolved geography to `Election`, `CandidateElection`, `Deadline`, and state voting-rule data.
5. Provide ZIP-only fallback results with a warning when a ZIP spans more than one district.
6. Log only coarse operational data such as provider latency, state, success/failure, and match quality. Never log the full address.

### Database changes

- `DistrictBoundaryVersion`: provider, geography type, valid dates, source version, and imported timestamp.
- `UserDistrictPreference`: optional account relation, state, district, match quality, and last resolved timestamp.
- `VotingPlanItem`: user/anonymous-plan identifier, action type, due date, completed state, and official URL.
- Do not add an address column unless a later opt-in use case is separately approved.

### Backend implementation

1. Add `district-resolver.service.ts` and provider adapters.
2. Add `ballot.service.ts` to compose district, elections, candidates, deadlines, and voting rules.
3. Add rate-limited `POST /api/ballot/resolve` with strict length and character validation.
4. Add `GET /api/ballot/:state/:district?cycle=2026` for non-address deep links.
5. Add authenticated or anonymous plan endpoints for completing checklist items.
6. Cache district-level ballot responses, but never cache requests by raw address.

### Frontend implementation

1. Add `/my-ballot` and a prominent home-page call to action.
2. Create a short lookup form with an explanation of transient address handling.
3. Display a confirmation step: “We found Congressional District X.”
4. Organize results into Your Races, Key Dates, Registration, Voting Options, and Your Plan.
5. Allow printing or saving a clean ballot guide without analytics identifiers.
6. Persist anonymous district and checklist state locally with an obvious clear-data control.
7. Provide full keyboard, screen-reader, and error-state coverage.

### Security and privacy

- Apply a stricter endpoint rate limit and abuse monitoring.
- Redact request bodies from application and reverse-proxy logs.
- Add a short, specific privacy notice beside the address field.
- Add automated tests that verify addresses never reach logs, analytics, or persisted models.

### Testing

- Unit tests for normalization and district joins.
- Contract tests for the resolver adapter.
- Integration tests for exact, partial, ambiguous, and invalid matches.
- End-to-end tests for lookup, district confirmation, plan completion, print, and local-data deletion.
- Accessibility audit of the complete flow.

### Acceptance criteria

- A valid address returns the correct House district and applicable federal races.
- Ambiguous results do not guess; they ask for correction or direct users to an official lookup.
- No full address is stored or emitted to analytics/logs.
- Every displayed deadline or rule has an official source and last-verified date.

### Dependencies and estimate

- Depends on state voting rules, primary verification, and provenance foundations.
- Estimated effort: 5-8 engineer-weeks plus provider evaluation and content verification.

## 7. Feature 2: Source-Backed Issue Positions and Voting Records

### User outcome

Voters can compare what candidates have verifiably said and, for incumbents, how they acted on major issues without VoteInformed assigning endorsements or unsupported labels.

### Editorial model

Use a fixed, versioned issue taxonomy. A position is an evidence-backed claim, not a score inferred from party membership. Distinguish:

- Candidate statement.
- Official platform or campaign publication.
- Legislative vote.
- Bill sponsorship or cosponsorship.
- Questionnaire response.
- “No verified position found.”

### Database changes

- `Issue`: slug, neutral name, description, display order, and taxonomy version.
- `IssuePrompt`: a precise policy question within an issue.
- `CandidatePosition`: candidate, prompt, neutral summary, stance enum where appropriate, evidence status, review status, and effective dates.
- `PositionEvidence`: position, source record, excerpt, source locator, evidence type, and publication date.
- `LegislativeAction`: legislator identity, bill/vote ID, action type, date, chamber, title, result, and official source.
- `PositionRevision`: before/after data, editor, reason, and timestamp.

### Ingestion and editorial workflow

1. Start with 6-8 nationally relevant issues and 2-4 precise prompts per issue.
2. Import official congressional votes and sponsorship records for incumbents.
3. Allow trained editors to create concise summaries linked to one or more evidence records.
4. Use AI only to propose summaries; never auto-publish generated text. Require human review and record the model/prompt version internally.
5. Run symmetrical coverage reports that flag when one candidate in a race has substantially less research than another.
6. Re-review positions after a defined age or when a newer contradictory source appears.

### Backend implementation

1. Add issue, position, evidence, and legislative-action services.
2. Add public endpoints for issue taxonomy, candidate positions, and race comparison.
3. Add admin endpoints for draft, review, publish, reject, supersede, and revision history.
4. Return missing-position states explicitly rather than omitting candidates.
5. Add a source-conflict indicator when credible evidence differs over time.

### Frontend implementation

1. Add an Issues tab to candidate profiles.
2. Add issue rows to the race comparison view, with expandable evidence.
3. Display action type and date next to every position.
4. For incumbents, add a Voting Record tab with filters by issue, session, bill, and vote type.
5. Link official bill and roll-call pages directly.
6. Add methodology copy explaining that selected examples are not a complete record.

### Admin implementation

1. Add a research queue grouped by race and coverage gap.
2. Build a source-capture form with excerpt limits, URL validation, and duplicate detection.
3. Require a second reviewer for high-impact changes close to Election Day.
4. Expose unresolved correction reports beside the relevant position.

### Testing

- Permission and workflow-state tests.
- Tests ensuring unpublished or rejected positions never enter public responses.
- Snapshot tests for equal candidate presentation.
- Source-link validation and stale-evidence jobs.
- Editorial QA using a sample of candidates from multiple parties and incumbency states.

### Acceptance criteria

- Every published position has at least one viewable source.
- Candidate absence is shown as “no verified position found,” not interpreted as opposition.
- Users can separate statements from legislative actions.
- Changes remain visible in revision history.

### Dependencies and estimate

- Depends on provenance, admin review, and official legislative-data ingestion.
- Estimated effort: 8-12 engineer-weeks plus ongoing editorial staffing.

## 8. Feature 3: Data Trust, Freshness, and Corrections

### User outcome

Users can see where important information came from, how current it is, what coverage limitations apply, and how to report an error.

### Backend implementation

1. Complete the shared source/provenance models in Section 4.3.
2. Define freshness policies per domain: elections, ballot status, finance, ideology, state rules, issue positions, polling, and results.
3. Add a coverage calculator that evaluates required fields per candidate and race.
4. Add `POST /api/corrections` with spam controls, structured categories, optional contact email, and consent language.
5. Add admin endpoints to triage, assign, resolve, reject, and link correction reports to revisions.
6. Add a public status endpoint describing known data incidents without exposing internal details.

### Frontend implementation

1. Place `Last updated`, `Source`, and coverage indicators beside the data they describe rather than only in a footer.
2. Add a source drawer with publication/retrieval dates and methodology.
3. Add “Report a problem” to candidate, race, deadline, and voting-rule pages with the relevant record preselected.
4. Use plain-language warnings for partial lobby classification, unverified ballot status, stale rules, and modeled values.
5. Add a public corrections/change log for material fixes.

### Admin implementation

1. Add freshness dashboards by domain and state.
2. Add automated alerts for stale official sources, broken URLs, failed imports, and large unexpected record-count changes.
3. Add a correction-service-level target and aging queue.

### Testing and monitoring

- Verify every critical public response includes provenance metadata.
- Test correction spam limits and input sanitization.
- Add synthetic checks for official source links.
- Track freshness coverage and median correction resolution time.

### Acceptance criteria

- A user can find the source and update date for every election, deadline, finance summary, issue position, and result.
- Administrators can trace a public value to its import or editorial revision.
- Material corrections have a visible resolution record.

### Estimate

- Estimated effort: 5-7 engineer-weeks; parts should ship incrementally with other features.

## 9. Feature 4: Follow the Money 2.0

### User outcome

Voters can understand fundraising momentum, donor composition, geography, spending pace, and financial differences between candidates—not only lifetime totals.

### Metrics to add

- Receipts and disbursements over time.
- Latest reporting-period change.
- Cash burn rate and months of cash at recent spending pace, clearly labeled as a VoteInformed calculation.
- Itemized versus unitemized individual contributions.
- Small-donor proxy with an explicit FEC-data limitation.
- Donor geography by state and in-state versus out-of-state share.
- PAC, party, candidate loan, transfer, refund, and debt totals.
- Top employers and occupations with coverage percentages.
- Candidate-versus-race median and head-to-head comparisons.

### Database changes

- `FinancePeriodAggregate`: candidate, committee, cycle, period start/end, filing type, metrics, source filing, and amendment version.
- `DonorGeographyAggregate`: candidate, cycle, geography level, geography key, amount, count, and itemized-coverage denominator.
- `FinanceDerivedMetric`: metric key, value, model/formula version, period, and computed timestamp.
- Optional materialized aggregate tables for lobby, employer, occupation, and donor size.

### Backend implementation

1. Preserve report-level history rather than only the latest candidate summary.
2. Reconcile amended FEC reports so charts do not double count superseded filings.
3. Add aggregation jobs after finance synchronization.
4. Add candidate finance timeline, geography, composition, and race-comparison endpoints.
5. Cache immutable historical periods and invalidate current-period aggregates after sync.
6. Include coverage denominators and formula versions in every derived metric.

### Frontend implementation

1. Redesign the finance tab into Overview, Timeline, Donors, Industries, Geography, and Spending sections.
2. Add accessible line/bar charts with equivalent data tables.
3. Add opponent comparison with per-candidate reporting coverage.
4. Explain why itemized data cannot represent every small donor.
5. Provide a direct link to the underlying FEC filing or filtered transaction list.
6. Add finance sorting and lobby filters to the candidate directory.

### Testing

- Reconciliation fixtures for amended filings.
- Aggregate-versus-source validation against selected FEC reports.
- Calculation tests for burn rate, percentages, refunds, and transfers.
- Visual and screen-reader tests for charts and data tables.
- Performance tests for the highest-volume committees.

### Acceptance criteria

- Period totals reconcile to the selected FEC filing version.
- Comparisons use the same cycle and reporting cutoff.
- Derived metrics display definitions, coverage, and computation date.

### Dependencies and estimate

- Depends on completion of itemized backfill and finance-integrity work.
- Estimated effort: 7-10 engineer-weeks.

## 10. Feature 5: Outside-Spending Tracker

### User outcome

Users can see independent expenditures supporting or opposing candidates, including spender, amount, timing, and source filings, without implying coordination with the candidate.

### Data model

- `OutsideSpender`: FEC committee ID, name, type, party/ideology only when sourced, and source metadata.
- `IndependentExpenditure`: FEC transaction identity, spender, candidate, support/oppose code, amount, date, purpose, dissemination date, filing link, amendment state, and cycle.
- `OutsideSpendingAggregate`: candidate, cycle, support total, oppose total, spender count, last activity date, and computed timestamp.

### Backend implementation

1. Extend the FEC client for independent-expenditure endpoints and pagination.
2. Implement idempotent imports using FEC transaction/submission identifiers.
3. Handle amendments and memoed transactions using the same integrity approach as receipts/disbursements.
4. Schedule more frequent updates near primaries and Election Day.
5. Add endpoints by candidate, race, spender, date range, and support/oppose classification.
6. Add anomaly alerts for unusually large imports and classification failures.

### Frontend implementation

1. Add an Outside Spending section to candidate and race pages.
2. Separate “supporting candidate” and “opposing candidate” totals.
3. Add a timeline and top-spender list.
4. Display a prominent explanation that independent spending is legally separate from direct campaign contributions and is not proof of candidate coordination.
5. Link each transaction to its official FEC filing.

### Testing and acceptance criteria

- Imported totals match a set of official FEC candidate/spender queries.
- Amendments do not create duplicate spending.
- Support and oppose codes are never collapsed into a misleading net value.
- Every public amount can be traced to a filing.

### Estimate

- Estimated effort: 6-9 engineer-weeks.

## 11. Feature 6: Watchlists and Alerts

### User outcome

Users can follow races or candidates and receive selected alerts for deadlines, filings, large contributions, outside spending, debates, and ballot-status changes.

### Product decisions

Start with verified email and in-app alerts. Add browser push only after consent, delivery, and unsubscribe behavior are stable. SMS should be a separate later decision because of cost and compliance.

### Database changes

- `Watch`: user, target type, target ID, created date, and active state.
- `NotificationPreference`: channel, event type, digest/immediate frequency, quiet hours, and locale.
- `DomainEvent`: stable event type, subject, payload, source revision, occurred date, and deduplication key.
- `NotificationDelivery`: event, user, channel, state, attempt count, provider ID, delivered date, and failure category.
- `UnsubscribeToken`: hashed token, scope, expiration, and used date.

### Backend implementation

1. Introduce optional voter authentication and verified email.
2. Generate domain events by comparing newly ingested records with the previous published state.
3. Add watch CRUD and preference endpoints.
4. Build daily/weekly digest assembly and immediate alert eligibility.
5. Add delivery adapters, idempotency, retry/backoff, bounce handling, and suppression lists.
6. Enforce one-click unsubscribe and account deletion.
7. Add an in-app notification inbox.

### Frontend implementation

1. Add Follow actions to candidate and race pages.
2. Let users choose categories and frequency at follow time.
3. Add `/account/watchlist` and `/account/notifications`.
4. Provide a complete account-data deletion flow.
5. For anonymous users, offer local bookmarks without notifications and explain the account upgrade.

### Testing

- Event deduplication and retry tests.
- Authorization tests for all watch resources.
- Email rendering, unsubscribe, bounce, and suppression tests.
- Time-zone and quiet-hour tests.
- Load test digest fan-out before public launch.

### Acceptance criteria

- Users receive only explicitly selected categories and frequency.
- Duplicate imports cannot send duplicate alerts.
- Unsubscribe takes effect immediately.
- Account deletion removes or irreversibly anonymizes personal data according to policy.

### Dependencies and estimate

- Depends on voter accounts, domain-event infrastructure, and source-diff logic.
- Estimated effort: 7-10 engineer-weeks excluding third-party delivery procurement.

## 12. Feature 7: Candidate Decision Workspace

### User outcome

A voter selects two or three candidates and compares biography, issue positions, legislative actions, ideology, fundraising, lobby support, and outside spending in a single saved or printable workspace.

### Database and API plan

- `ComparisonWorkspace`: optional owner, anonymous share token, title, race, cycle, selected candidate IDs, display sections, expiration, and timestamps.
- `ComparisonNote`: optional private user note; keep out of analytics and AI processing.
- Add `POST /api/comparisons/preview` for anonymous comparisons and authenticated CRUD for saved workspaces.
- Add read-only share links with revocation and expiration.
- Return a common reporting cutoff so all financial comparisons are time-aligned.

### Frontend implementation

1. Extend the existing race comparison into a selectable workspace.
2. Add sticky candidate columns and collapsible sections for mobile.
3. Include explicit missing-data rows so empty cells do not look like neutral positions or zero dollars.
4. Add source drawers at the row/cell level.
5. Add print/PDF styles and a copyable read-only link.
6. Let anonymous users save locally and signed-in users sync across devices.
7. Do not create a single “best candidate” score.

### Testing and acceptance criteria

- Only candidates in the selected race/cycle can enter a workspace by default.
- Every comparison value uses the same definition and time cutoff.
- Shared links cannot expose private notes or account identity.
- The comparison is usable with keyboard navigation and on a narrow mobile screen.

### Dependencies and estimate

- Most valuable after issue positions and finance comparisons exist.
- Estimated effort: 4-6 engineer-weeks.

## 13. Feature 8: “What Changed This Week?” Feed

### User outcome

Users get a concise, state- or watchlist-specific view of newly verified candidates, finance changes, new issue evidence, outside spending, debates, deadlines, and corrections.

### Data model

Reuse `DomainEvent` from alerts and add:

- `FeedItem`: event relation, public headline, neutral summary, geography, importance, publish status, source list, and expiration.
- `FeedEditorialReview`: reviewer, action, notes, and timestamps for events that require human wording.

### Backend implementation

1. Emit structured events from candidate, election, finance, content, deadline, and correction pipelines.
2. Add deterministic templates for straightforward facts such as filing totals and deadlines.
3. Route ambiguous events to editorial review instead of publishing automatically.
4. Deduplicate amended filings and repeated source imports.
5. Rank by location relevance, recency, materiality, and watch relationship—not political party.
6. Add `/api/feed?state=&district=&since=&cursor=` and watchlist feed endpoints.

### Frontend implementation

1. Add a home-page preview and `/updates` page.
2. Add state, race, category, and date filters.
3. Show before/after values for changed structured facts.
4. Link directly to the relevant candidate/race section and sources.
5. Allow feed items to be included in the alerts digest.

### Testing and acceptance criteria

- Each feed item has at least one source and an event deduplication key.
- Party does not affect event importance.
- Corrections clearly state what changed without repeating sensitive report content.
- Pagination remains stable as new events arrive.

### Dependencies and estimate

- Depends on domain events, provenance, and reliable change detection.
- Estimated effort: 5-7 engineer-weeks.

## 14. Feature 9: Verified Campaign Response Portal

### User outcome

Campaigns can submit official biographies, issue responses, links, debate information, and correction requests, while VoteInformed retains independent review and public provenance.

### Trust model

Campaign content must be labeled “Provided by the campaign.” A campaign can submit information but cannot directly overwrite FEC data, official results, VoteInformed methodology, or reviewed editorial summaries.

### Database changes

- `CampaignOrganization`: candidate, official name, verification state, and verified domains.
- `CampaignUser`: organization, email, role, MFA state, and active state.
- `CampaignSubmission`: submission type, structured payload, source attachments, review state, submitter, reviewer, and timestamps.
- `CampaignPublishedContent`: candidate, content type, current revision, disclaimer, and effective dates.
- `CampaignAuditEvent`: authentication and content workflow events.

### Verification and security

1. Require official-domain email where possible plus a secondary verification procedure.
2. Require MFA for campaign users.
3. Use strict file-type, size, and malware scanning for attachments—or avoid uploads in the initial release and accept source URLs only.
4. Rate limit submissions and prevent public HTML injection.
5. Preserve all revisions and reviewer actions.
6. Provide account revocation and candidate-campaign reassignment procedures.

### Backend and admin implementation

1. Create separate campaign authentication and authorization middleware.
2. Add draft and submit endpoints; do not expose unapproved content publicly.
3. Add an admin review queue with compare/revision views.
4. Notify campaigns of approval, rejection, or clarification requests.
5. Add a response deadline and escalation path during high-volume election periods.

### Frontend implementation

1. Add a campaign portal separate from the voter and researcher portals.
2. Use structured prompts for issue responses to improve cross-candidate comparability.
3. Display campaign-provided content in a clearly labeled section with date and source.
4. Show whether VoteInformed independently verified linked factual claims.

### Testing and acceptance criteria

- Campaign users can modify only the candidate organization they represent.
- No submission is public before review.
- Campaign-provided and independently sourced content are visually and semantically distinct.
- Every published change has a complete audit trail.

### Estimate

- Estimated effort: 8-12 engineer-weeks plus operational verification staffing.

## 15. Feature 10: Research Lab 2.0

### User outcome

Researchers can save, compare, share, and export transparent scenarios with statewide and per-race assumptions, turnout adjustments, uncertainty ranges, and county-level visualization.

### Model improvements

Keep the existing uniform swing simulator as a clearly labeled baseline model. Add model types incrementally:

1. Uniform two-party swing.
2. Per-state and per-race swing overrides.
3. Turnout changes by county or selected demographic proxy only when licensed, methodologically defensible data is available.
4. Uncertainty bands created from explicit user assumptions or documented historical error—not unexplained probability scores.

### Database changes

- Extend `SavedSimulation` with model type/version, dataset version, visibility, description, output summary, last-run timestamp, and stale reason.
- `SimulationRun`: immutable input, output, duration, model version, dataset version, and creator.
- `DatasetVersion`: source, cycle coverage, import checksum, methodology, and release date.

### Backend implementation

1. Complete saved-scenario CRUD from Section 4.4.
2. Version simulation request schemas and maintain backward-compatible reading.
3. Add per-race and turnout controls to the simulation service.
4. Run larger simulations as background jobs with progress and cancellation.
5. Add side-by-side run comparison and export endpoints.
6. Provide CSV for tabular results and SVG/PNG-ready chart data; ensure exports include methodology and data version.
7. Add hard resource limits and researcher-specific rate limits.

### Frontend implementation

1. Add Save, Duplicate, Compare, Share, and Export actions.
2. Replace free-text state entry with searchable state/district selectors.
3. Add a county choropleth with an accessible table fallback.
4. Show baseline, simulated result, change, and uncertainty for each race.
5. Add a persistent methodology panel and warn when a saved run uses an old dataset/model.
6. Provide a “re-run with current data” action that preserves the original run.

### Testing and acceptance criteria

- A saved run remains reproducible against its recorded model and dataset version.
- Totals are deterministic for identical inputs.
- Exports contain parameters, timestamps, model version, dataset sources, and limitations.
- Maps never become the only way to access county values.

### Estimate

- Estimated effort: 8-12 engineer-weeks after saved scenarios are completed.

## 16. Feature 11: Publisher and Civic-Organization Toolkit

### User outcome

Journalists, universities, and civic organizations can embed reliable race/candidate modules, download documented datasets, and cite stable VoteInformed pages.

### Public API plan

1. Define a versioned `/api/v1/public` namespace rather than exposing internal response shapes as a permanent contract.
2. Publish OpenAPI documentation, field definitions, update cadence, licenses, limitations, and example requests.
3. Use API keys for measured higher-volume access while retaining low-volume public access where sustainable.
4. Add per-key quotas, usage logs, revocation, and contact metadata.
5. Provide stable IDs and cursor pagination.

### Embed plan

1. Create script/iframe embeds for race summary, candidate comparison, deadline card, finance summary, and results.
2. Support neutral light/dark themes, limited color customization, responsive width, and accessible height messaging.
3. Include VoteInformed attribution, source links, last-updated time, and a canonical-page link.
4. Apply a strict Content Security Policy and origin controls for preview/admin tooling.

### Dataset exports

1. Offer CSV/JSON exports by state, race, cycle, and data domain.
2. Generate exports asynchronously and store them with expiration and checksums.
3. Attach a data dictionary, source manifest, license/attribution file, and generated timestamp.
4. Exclude voter accounts, correction reporter data, private notes, campaign-user data, and unpublished editorial content.

### Frontend and admin implementation

1. Add `/developers` with documentation and an embed configurator.
2. Add API-key creation/rotation and usage views.
3. Add admin controls for quotas, abuse review, dataset generation, and deprecation notices.

### Testing and acceptance criteria

- Public API changes follow a documented version/deprecation policy.
- Embeds are keyboard accessible and include source/freshness context.
- Exports contain only approved public fields.
- Quotas and revocation work without affecting the main voter site.

### Dependencies and estimate

- Best after provenance and data contracts stabilize.
- Estimated effort: 7-10 engineer-weeks.

## 17. Feature 12: Election-Night Results Mode

### User outcome

Users can follow live official results, reporting progress, county detail, and race status with clear sourcing and no premature or opaque race calls.

### Product policy before code

1. Choose the official/result provider and document its update latency, corrections process, geographic coverage, and permitted display/storage.
2. Decide whether VoteInformed will ever call races. The recommended initial release should display official/provider status only and label it exactly.
3. Publish an election-night correction and outage procedure.
4. Define freeze windows for unrelated production changes.

### Database changes

- `ElectionResultSnapshot`: election, provider, timestamp, reporting units, expected units, total votes, and status.
- `CandidateResultSnapshot`: result snapshot, candidate, votes, percentage, rank, and winner/called flags as sourced.
- `GeographicResultSnapshot`: county/precinct identifier, candidate totals, reporting progress, and timestamp.
- `ResultIncident`: affected races, public message, start/end time, and resolution.

High-volume snapshot storage may require partitioning or retention/downsampling after certification.

### Backend implementation

1. Build provider adapters and normalize results to stable internal schemas.
2. Make ingestion idempotent and monotonic where appropriate while permitting official corrections.
3. Publish updates through Server-Sent Events initially; use WebSockets only if bidirectional behavior becomes necessary.
4. Add cache and CDN strategies for race/state summary endpoints.
5. Add stale-feed detection, provider failover behavior, and public incident status.
6. Preserve enough snapshots for audit and trend display, then downsample according to retention policy.
7. Load test at projected peak traffic well before Election Day.

### Frontend implementation

1. Add a clear Live Results mode with last-updated and connection state.
2. Display total votes, candidate shares, reporting progress, geographic breakdown, and sourced status.
3. Avoid declaring a winner from simple vote position when the provider has not called the race.
4. Add stale-data and correction banners.
5. Provide a low-bandwidth table view and accessible live-region behavior that does not overwhelm screen readers.
6. Add state and watched-race result alerts only with explicit user opt-in.

### Operations and testing

- Conduct replay tests using historical result streams.
- Run traffic, cache-failure, provider-outage, delayed-update, and corrected-result drills.
- Staff an election-night on-call and editorial escalation rotation.
- Monitor ingest latency, client update latency, stale races, error rate, and provider divergence.

### Acceptance criteria

- Every result and called status identifies its provider and update time.
- A stale or unavailable feed is visibly distinguishable from zero votes.
- Official corrections propagate without losing the earlier audit snapshot.
- The platform meets the agreed peak-load target in a pre-election load test.

### Dependencies and estimate

- Requires a licensed result source, mature monitoring, provenance, caching, and incident operations.
- Estimated effort: 10-16 engineer-weeks plus provider integration and election operations.

## 18. Feature 13: Multilingual and Offline Voter Guide

### User outcome

Voters can use the core ballot and voting-plan experience in their preferred supported language and retain essential information when connectivity is limited.

### Internationalization foundation

1. Introduce an i18n library and move all interface strings into namespaced translation catalogs.
2. Use stable message IDs, ICU-style plural/date/number formatting, and locale-aware currency formatting.
3. Separate translated interface text from dynamic election content.
4. Store source language, translation language, translation status, reviewer, and source revision for dynamic content.
5. Start with Spanish based on national reach; prioritize additional languages using user need and Voting Rights Act language-coverage data.

### Translation workflow

1. Professionally translate legal, voting-rule, methodology, error, privacy, and action-oriented content.
2. Use machine translation only for drafts and require human review before publishing critical voter instructions.
3. Invalidate translations when the source revision changes.
4. Add terminology/glossary management for election-specific terms.
5. Include a visible fallback indicator when content remains in English.

### Offline/PWA implementation

1. Add a web-app manifest and service worker.
2. Cache the application shell and only voter-selected ballot-guide data.
3. Provide an explicit “Save this guide offline” action; do not silently cache address queries or account data.
4. Store district-level content, not raw addresses.
5. Display saved timestamp, source freshness, and a prominent offline/stale warning.
6. Queue only safe local interactions such as checklist completion; require reconnection for registration-status systems and authoritative live data.
7. Exclude election-night results, account tokens, correction submissions, and chat from long-lived caches.

### Frontend implementation

1. Add a language selector that persists locally and optionally to the user account.
2. Ensure layouts handle text expansion and long translated state rules.
3. Translate accessible names, validation errors, chart descriptions, print views, and email notifications.
4. Add an offline library listing saved ballot guides with delete controls.

### Testing and acceptance criteria

- Critical voting instructions are human-reviewed in every supported language.
- Changing the source marks older translations stale until reapproved.
- A saved guide loads without network access and clearly shows when it was saved.
- Clearing offline content removes cached voter-guide data.
- Pseudolocalization, screen-reader, keyboard, and translated end-to-end tests pass.

### Dependencies and estimate

- Most valuable after My Ballot and state rules stabilize.
- Estimated effort: 8-12 engineer-weeks for Spanish and offline core, followed by ongoing translation operations.

## 19. Optional polling feature

The race page currently reserves space for polling. Polling should not launch as a placeholder integration; it needs source and methodology safeguards.

Implementation:

1. License or select a reputable polling data source.
2. Add `Poll`, `PollSample`, and `PollResult` with pollster, sponsor, field dates, population, mode, sample size, margin of error, candidate mapping, source, and correction state.
3. Never average polls with missing candidate/sample metadata silently.
4. If building an average, publish inclusion rules, weighting, house-effect policy, recency decay, and versioned methodology.
5. Display individual polls before introducing a VoteInformed aggregate.
6. Clearly separate polls from results and simulator outputs.
7. Add pollster/candidate alias review tools and duplicate detection.

Estimated effort: 5-8 engineer-weeks after data licensing.

## 20. Recommended delivery sequence

### Release 0: Reliability and trust foundation

Target: 4-6 weeks

- Primary-election verification.
- State voting-rules schema and first-state content workflow.
- Shared source/provenance models and UI components.
- Finance/itemized synchronization integrity.
- Saved simulation CRUD.
- Feature flags and privacy-preserving analytics.

Exit criteria: major public records expose source, freshness, verification, and correction paths.

### Release 1: Personalized voter journey

Target: 6-9 weeks

- My Ballot district resolution.
- State-specific voter resources.
- Voting checklist, print view, and anonymous local persistence.
- Spanish/i18n technical foundation, even if full translation follows later.

Exit criteria: a voter can identify their federal ballot and complete a sourced voting plan without creating an account.

### Release 2: Candidate decision quality

Target: 8-12 weeks

- Issue taxonomy and first researched issue set.
- Incumbent legislative actions.
- Expanded decision workspace.
- Coverage and editorial review dashboard.

Exit criteria: users can compare candidates on documented issue evidence and current campaign finance from the same race page.

### Release 3: Money and change intelligence

Target: 8-12 weeks

- Follow the Money 2.0.
- Outside-spending ingestion and display.
- Domain-event infrastructure.
- “What Changed This Week?” feed.

Exit criteria: financial data reconciles to source filings and material changes generate sourced, deduplicated events.

### Release 4: Retention and participation

Target: 7-10 weeks

- Optional voter accounts.
- Watchlists and email/in-app alerts.
- Cross-device saved comparisons and voting plans.
- Offline voter-guide core.

Exit criteria: consent, unsubscribe, account deletion, retry, and duplicate-notification tests pass.

### Release 5: Professional workflows

Target: 10-14 weeks

- Research Lab 2.0.
- Campaign response portal.
- Publisher API, exports, and embeds.

Exit criteria: permissions, audit logs, data contracts, quotas, and export privacy are production ready.

### Release 6: Election readiness

Target: begin at least 4-6 months before Election Day

- Licensed live results.
- Results replay and load testing.
- Incident/status communication.
- Election-night UI and opt-in result alerts.
- Broader language coverage.

Exit criteria: historical replay, provider outage, corrections, and peak-load drills have succeeded.

## 21. Suggested team workstreams

These features should not be assigned as isolated frontend tickets. A practical team structure is:

- Voter Experience: My Ballot, voting plan, decision workspace, accessibility, i18n, and offline behavior.
- Elections Data: official election/primary data, state rules, results, polling, boundaries, and provenance.
- Campaign Finance: FEC sync integrity, timelines, aggregates, lobbies, and outside spending.
- Editorial and Trust: issues, voting records, campaign submissions, corrections, source review, and nonpartisan coverage audits.
- Research and Platform: simulator, datasets, API, embeds, exports, authentication, jobs, and observability.

Each workstream should have an engineering owner and a product/data or editorial counterpart where the feature involves interpretation or source review.

## 22. Cross-feature test strategy

### Automated tests

- Service-level unit tests for calculations and normalization.
- API integration tests with an isolated PostgreSQL database.
- Contract fixtures for every third-party provider.
- Migration tests against a copy of the current schema.
- End-to-end tests for top voter, researcher, campaign, and admin journeys.
- Authorization matrix tests for public, voter, researcher, campaign, and admin roles.
- Accessibility checks plus manual keyboard and screen-reader testing.
- Visual regression tests for comparison tables, charts, maps, print layouts, and translated pages.

### Data quality tests

- Duplicate and amendment reconciliation.
- Required provenance and last-verified fields.
- Candidate/race coverage symmetry.
- Unexpected count and dollar-amount changes.
- Invalid source URLs and stale official content.
- Cross-check samples against FEC, official state sources, and result providers.

### Performance tests

- Candidate/race pages at normal traffic.
- High-volume finance and outside-spending queries.
- Alert digest fan-out.
- Public API quota behavior.
- Election-night sustained and spike traffic.

## 23. Operational and legal checklist

Before any feature leaves beta:

- Confirm source license and attribution requirements.
- Document the authoritative owner for content corrections.
- Complete privacy review for new personal data or third-party delivery.
- Add retention and deletion rules to the data inventory.
- Update terms, privacy policy, and methodology where necessary.
- Add monitoring, alert thresholds, runbooks, and rollback procedures.
- Add admin tools needed to operate the feature; do not rely on direct database edits.
- Train editors or support staff on labels, review standards, and escalation.

## 24. Success measures

Use mission-aligned measures rather than only page views:

- Percentage of ballot lookups that reach a race and official voting resource.
- Voting plans created and checklist completion rate.
- Official registration, polling-place, and absentee-resource click-through rate.
- Candidate comparisons completed and sources opened.
- Percentage of candidate positions with current, reviewed evidence.
- Finance and outside-spending freshness and reconciliation accuracy.
- Race and state rule coverage with verified sources.
- Watch retention, alert usefulness, unsubscribe, bounce, and complaint rates.
- Correction volume, validity rate, and median resolution time.
- Research scenario saves, exports, and citations.
- Accessibility defects and task-completion results from usability testing.

## 25. Immediate next actions

1. Approve the release sequence and assign owners for Voter Experience, Elections Data, Finance, Editorial/Trust, and Platform.
2. Create architecture decision records for district resolution, optional voter authentication, job delivery, provenance modeling, and live-result sourcing.
3. Implement the source/provenance and state voting-rule models first.
4. Conduct a privacy review of the proposed address-resolution flow before choosing a provider.
5. Select three pilot states representing different primary and voting-rule structures.
6. Prototype the full My Ballot-to-voting-plan journey using pilot-state data.
7. Define the initial issue taxonomy and editorial review handbook.
8. Turn each release above into epics with schema, API, frontend, admin, data, test, and operations tickets.

