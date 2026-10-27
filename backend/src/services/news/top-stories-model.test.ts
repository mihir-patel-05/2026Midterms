import assert from 'node:assert/strict';
import { test } from 'node:test';
import { anthropicPicker } from './top-stories-model.js';

function fakeAnthropic(reply: { stop_reason: string; text: string | null }) {
  const requests: Array<{ url: string; headers: Headers; body: Record<string, unknown> }> = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({
      id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5',
      content: reply.text === null ? [] : [{ type: 'text', text: reply.text }],
      stop_reason: reply.stop_reason, stop_sequence: null,
      usage: { input_tokens: 900, output_tokens: 120 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { fetchImpl, requests };
}

test('the picker asks for structured output at low effort with refusal fallbacks, and parses the answer', async () => {
  const answer = { picks: [{ storyId: 'S1', reason: 'POLL', raceKeys: ['PA-SEN'] }], excluded: [] };
  const { fetchImpl, requests } = fakeAnthropic({ stop_reason: 'end_turn', text: JSON.stringify(answer) });
  const result = await anthropicPicker('test-key', 'claude-opus-5-5', fetchImpl)('system text', 'user text');

  assert.deepEqual(result.output, answer);
  assert.equal(result.inputTokens, 900);
  const [request] = requests;
  assert.match(request.url, /\/v1\/messages/);
  assert.match(request.headers.get('anthropic-beta') ?? '', /server-side-fallback-2026-07-01/);
  assert.equal(request.body.model, 'claude-opus-5-5');
  assert.equal(request.body.fallbacks, 'default');
  assert.equal(request.body.system, 'system text');
  const outputConfig = request.body.output_config as { effort: string; format: { type: string; schema: { properties: Record<string, unknown> } } };
  assert.equal(outputConfig.effort, 'low');
  assert.equal(outputConfig.format.type, 'json_schema');
  assert.deepEqual(Object.keys(outputConfig.format.schema.properties).sort(), ['excluded', 'picks']);
  // Opus 5.5 rejects these, so they must never be sent.
  for (const field of ['temperature', 'thinking', 'tool_choice']) assert.equal(field in request.body, false, field);
});

test('a refusal comes back as no output', async () => {
  const { fetchImpl } = fakeAnthropic({ stop_reason: 'refusal', text: null });
  const result = await anthropicPicker('test-key', 'claude-opus-5-5', fetchImpl)('s', 'u');
  assert.equal(result.output, null);
  assert.equal(result.stopReason, 'refusal');
});
