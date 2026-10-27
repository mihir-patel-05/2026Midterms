/**
 * The Claude call behind the top stories agent: structured outputs against the picker
 * schema, low effort (the task is ranking 30 short items), and server-side refusal
 * fallbacks. A refusal or unparsable answer comes back as output null; the agent
 * records it and the site keeps showing the trending list.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { pickerOutputSchema, type PickerModel } from './top-stories-agent.js';

export function anthropicPicker(apiKey: string, model: string, fetchImpl?: typeof fetch): PickerModel {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 180_000, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  return async (system, user) => {
    const message = await client.beta.messages.parse({
      model,
      max_tokens: 16_000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      output_config: { effort: 'low', format: betaZodOutputFormat(pickerOutputSchema) },
      messages: [{ role: 'user', content: user }],
    });
    return {
      output: message.stop_reason === 'refusal' ? null : message.parsed_output ?? null,
      model: message.model,
      stopReason: message.stop_reason,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };
  };
}
