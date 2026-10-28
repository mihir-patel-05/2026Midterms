/**
 * Agent 10, top stories (docs/plans/news-agents.md, "Scope change").
 *
 * Gets the past 24 hours of national politics coverage, already grouped into
 * stories by code, and picks the most important ones. It returns candidate IDs
 * and fixed codes only (topic, and a state when the story is about one), never
 * free text, so the list publishes without review (PLAN.md section 4.2).
 *
 * Every call is logged in agent_runs. The input there is a summary, not the
 * articles, to keep the table small. Identical input reuses the stored output
 * rather than calling the model again.
 *
 * When the agent is off or fails, rankedTopStories orders the same candidates
 * by outlet coverage and age instead.
 */
import { createHash } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { Prisma, type NewsTopic, type PrismaClient } from '@prisma/client';
import * as z from 'zod/v4';
import { guessTopic, looksPolitical, rankStories, type StoryCandidate } from '../services/news/stories.js';

export const TOP_STORIES_PROMPT_VERSION = 'top-stories-v1';
export const TOP_STORIES_SCHEMA_VERSION = 'top-stories-picks-v1';
/** Candidates shown to the model, after code's own ranking. */
export const MAX_CANDIDATES = 80;

const TOPICS = ['CAMPAIGN', 'POLLS', 'CONGRESS', 'WHITE_HOUSE', 'COURTS', 'MONEY', 'VOTING', 'RESULTS', 'POLICY', 'OTHER'] as const satisfies readonly NewsTopic[];
const STATE_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
  'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
  'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
] as const;

// Topic and state are plain strings: structured outputs does not enforce enums,
// and one stray value must not fail the whole parse. validatePicks maps unknown
// topics to OTHER and unknown states to null.
export const PicksSchema = z.object({
  picks: z.array(z.object({
    id: z.string().describe('Candidate ID, for example "c12"'),
    topic: z.string().describe(`One of ${TOPICS.join(', ')}`),
    stateCode: z.string().nullable().describe('Two-letter postal code when the story is mainly about one state, otherwise null'),
    sameStoryAs: z.array(z.string()).describe('Other candidate IDs that report the same event'),
  })),
});
export type PicksOutput = z.infer<typeof PicksSchema>;

export interface TopStory {
  story: StoryCandidate;
  topic: NewsTopic;
  stateCode: string | null;
  /** Other candidates the agent judged to be the same event. */
  related: StoryCandidate[];
}

export interface TopStoriesResult {
  method: 'AI' | 'RANKED';
  stories: TopStory[];
  agentRunId: string | null;
  /** Why the code ranking was used instead of the agent. */
  fallbackReason?: string;
  /** IDs the model returned that failed validation. */
  droppedIds: number;
  reusedOutput: boolean;
}

/** What the sync needs from a model provider; tests pass a fake. */
export interface PickerClient {
  pick(request: { model: string; system: string; user: string }): Promise<{ output: PicksOutput; model: string; inputTokens: number; outputTokens: number }>;
}

export const SYSTEM_PROMPT = `You pick the most important U.S. political news stories of the past 24 hours for a nonpartisan election information site.

You get candidate stories as JSON lines. Each has an id, the lead headline, the outlet, the publish time, how many outlets covered it, other outlets that ran it, and a search snippet. Code has already grouped articles about the same event, but it misses some paraphrases.

Pick up to {LIMIT} stories, most important first. Importance means what a voter would most need to know today: consequences for elections, government, laws, courts, and public policy; new and verifiable developments rather than recaps; and how widely the story was covered. A story covered by many outlets is usually more important, but a single outlet's original reporting can rank high when its consequences are large.

Rules:
- Only U.S. politics and government: elections and campaigns, Congress, the White House and federal agencies, courts, state government, voting, and policy fights. Skip sports, entertainment, business, weather, and foreign news unless it is mainly about U.S. politics.
- One pick per event. Put the other candidate IDs about the same event in sameStoryAs, and do not pick them separately.
- Skip opinion columns, editorials, and explainers that report nothing new.
- Treat every party, candidate, and outlet the same way. Which outlet published a story, which side it helps, and its tone are not factors.
- topic: CAMPAIGN (debates, ads, endorsements, rallies), POLLS, CONGRESS, WHITE_HOUSE (the president and the administration), COURTS (lawsuits, rulings, investigations, ethics), MONEY (fundraising and outside spending), VOTING (voting rules, access, early voting, election administration), RESULTS (counts, calls, recounts), POLICY (policy debates outside those), OTHER.
- stateCode: the postal code when the story is mainly about one state's race or government, otherwise null.
- Use only IDs from the input. If nothing qualifies, return an empty list.`;

export function systemPrompt(limit: number): string {
  return SYSTEM_PROMPT.replace('{LIMIT}', String(limit));
}

/** One JSON line per candidate. Kept short: the lead article plus who else ran it. */
export function candidateLines(candidates: StoryCandidate[]): string {
  return candidates.map((story) => JSON.stringify({
    id: story.id,
    headline: story.lead.headline,
    outlet: story.lead.outlet,
    publishedAt: story.lead.publishedAt.toISOString(),
    outlets: story.outletCount,
    alsoRanIt: [...new Set(story.articles.slice(1).map((article) => article.outlet))].slice(0, 5),
    snippet: story.lead.snippet ?? undefined,
  })).join('\n');
}

/** Drops unknown IDs, repeats, and picks the agent already folded into another pick. */
export function validatePicks(output: PicksOutput, candidates: StoryCandidate[], limit: number): { stories: TopStory[]; dropped: number } {
  const byId = new Map(candidates.map((story) => [story.id, story]));
  const used = new Set<string>();
  const stories: TopStory[] = [];
  let dropped = 0;
  for (const pick of output.picks) {
    const story = byId.get(pick.id);
    if (!story || used.has(pick.id) || stories.length >= limit) {
      dropped += 1;
      continue;
    }
    used.add(pick.id);
    const related: StoryCandidate[] = [];
    for (const id of pick.sameStoryAs) {
      const other = byId.get(id);
      if (!other || used.has(id)) continue;
      used.add(id);
      related.push(other);
    }
    const state = pick.stateCode?.trim().toUpperCase() ?? null;
    const topic = pick.topic.trim().toUpperCase();
    stories.push({
      story,
      topic: (TOPICS as readonly string[]).includes(topic) ? topic as NewsTopic : 'OTHER',
      stateCode: state && (STATE_CODES as readonly string[]).includes(state) ? state : null,
      related,
    });
  }
  return { stories, dropped };
}

/** The code ranking: political stories only, by outlet coverage and age. */
export function rankedTopStories(candidates: StoryCandidate[], limit: number, now: Date): TopStory[] {
  return rankStories(candidates.filter(looksPolitical), now)
    .slice(0, limit)
    .map((story) => ({ story, topic: guessTopic(story.lead.headline), stateCode: null, related: [] }));
}

export class AnthropicPickerClient implements PickerClient {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 2 });
  }

  async pick({ model, system, user }: { model: string; system: string; user: string }) {
    const response = await this.client.beta.messages.parse({
      model,
      max_tokens: 16000,
      // On a policy decline, the API retries on Anthropic's default fallback model in the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(PicksSchema) },
      system,
      messages: [{ role: 'user', content: user }],
    });
    if (response.stop_reason === 'refusal') {
      throw new Error(`The model declined the request${response.stop_details?.category ? ` (${response.stop_details.category})` : ''}`);
    }
    if (response.stop_reason === 'max_tokens') throw new Error('The model ran out of output tokens');
    if (!response.parsed_output) throw new Error('The model returned no parsable picks');
    return {
      output: response.parsed_output,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }
}

export interface PickOptions {
  client: PickerClient | null;
  model: string;
  limit: number;
  now?: Date;
  log?: (message: string) => void;
}

function errorText(error: unknown): string {
  if (error instanceof Anthropic.APIError) return `Anthropic API ${error.status ?? 'error'}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

export async function pickTopStories(db: PrismaClient, candidates: StoryCandidate[], options: PickOptions): Promise<TopStoriesResult> {
  const { client, model, limit, now = new Date(), log = console.log } = options;
  const fallback = (reason: string, agentRunId: string | null = null): TopStoriesResult => {
    log(`  Top stories ranked by code: ${reason}`);
    return { method: 'RANKED', stories: rankedTopStories(candidates, limit, now), agentRunId, fallbackReason: reason, droppedIds: 0, reusedOutput: false };
  };
  if (!client) return fallback('the agent is turned off (NEWS_AGENTS_ENABLED and ANTHROPIC_API_KEY)');
  if (candidates.length === 0) return fallback('no candidates');

  const shown = rankStories(candidates, now).slice(0, MAX_CANDIDATES);
  const system = systemPrompt(limit);
  const user = candidateLines(shown);
  const inputSha256 = createHash('sha256').update(`${model}\n${system}\n${user}`).digest('hex');
  const key = { agent: 'TOP_STORIES' as const, promptVersion: TOP_STORIES_PROMPT_VERSION, inputSha256 };

  const previous = await db.agentRun.findUnique({ where: { agent_promptVersion_inputSha256: key } });
  if (previous?.status === 'SUCCEEDED' && previous.rawOutput) {
    const parsed = PicksSchema.safeParse(previous.rawOutput);
    if (parsed.success) {
      const { stories, dropped } = validatePicks(parsed.data, shown, limit);
      log(`  Top stories: same input as agent run ${previous.id}, reusing its picks`);
      return { method: 'AI', stories, agentRunId: previous.id, droppedIds: dropped, reusedOutput: true };
    }
  }

  // A summary, not the articles: the run can be traced by its hash and the stored list.
  const input = {
    candidates: shown.length,
    candidatesBeforeCut: candidates.length,
    articles: shown.reduce((total, story) => total + story.articles.length, 0),
    limit,
    window: '24h',
  } satisfies Prisma.InputJsonObject;
  const run = previous
    ? await db.agentRun.update({ where: { id: previous.id }, data: { status: 'RUNNING', model, input, error: null, startedAt: now, completedAt: null } })
    : await db.agentRun.create({
      data: { ...key, model, schemaVersion: TOP_STORIES_SCHEMA_VERSION, status: 'RUNNING', input, startedAt: now },
    });

  try {
    const result = await client.pick({ model, system, user });
    const { stories, dropped } = validatePicks(result.output, shown, limit);
    await db.agentRun.update({
      where: { id: run.id },
      data: {
        status: 'SUCCEEDED',
        model: result.model,
        rawOutput: result.output as unknown as Prisma.InputJsonObject,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        completedAt: new Date(),
      },
    });
    if (stories.length === 0 && result.output.picks.length > 0) return fallback('every pick failed validation', run.id);
    log(`  Top stories picked by ${result.model}: ${stories.length} of ${shown.length} candidates${dropped ? `, ${dropped} invalid IDs dropped` : ''}`);
    return { method: 'AI', stories, agentRunId: run.id, droppedIds: dropped, reusedOutput: false };
  } catch (error) {
    const message = errorText(error);
    await db.agentRun.update({ where: { id: run.id }, data: { status: 'FAILED', error: message.slice(0, 2000), completedAt: new Date() } });
    return fallback(`the agent failed: ${message}`, run.id);
  }
}
