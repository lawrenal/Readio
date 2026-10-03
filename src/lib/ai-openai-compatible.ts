/**
 * Shared client for any provider that speaks the OpenAI Chat Completions
 * wire format — OpenAI itself, xAI's Grok (its own docs describe it as
 * "OpenAI SDK compatible, just change base_url and api_key"), and Open
 * WebUI's /api/chat/completions endpoint (same shape, fronting
 * self-hosted Llama/etc. models). One fetch-based implementation instead
 * of three near-identical ones.
 *
 * Uses `max_tokens`, not OpenAI's newer `max_completion_tokens` — OpenAI
 * still accepts `max_tokens` and auto-converts it internally for
 * backward compatibility, and it's the parameter name xAI's and Open
 * WebUI's own docs actually show, so this is the one spelling that
 * reliably works across all three rather than risking an unrecognized-
 * parameter response from the two that haven't necessarily adopted
 * OpenAI's rename.
 */
// Found for real, not hypothetically: pointed at a local Ollama running a
// "thinking" model (Qwen3, Metal-accelerated on Apple Silicon — not CPU,
// that was my own wrong first guess), a real generation request sat for
// 10+ minutes with zero visible progress and no way to tell "still
// working" from "dead connection" apart from killing the container. A
// generous but finite timeout means a genuinely-slow-but-alive local
// model still has a real chance to finish, while a truly stuck/
// unreachable one doesn't lock up the generation flag indefinitely.
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export async function chatComplete(input: {
  baseUrl: string;
  apiKey?: string;
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  timeoutMs?: number;
  /** Ollama-specific (silently ignored by OpenAI/xAI/most others) — see
   * ai-ollama.ts for why this exists: Ollama's OpenAI-compatible endpoint
   * otherwise silently truncates context to 4096 tokens regardless of
   * the model's real capability, discarding the oldest part of a long
   * prompt with no error. */
  numCtx?: number;
}): Promise<string> {
  const url = `${input.baseUrl.replace(/\/$/, "")}/chat/completions`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: input.model,
        max_tokens: input.maxTokens,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
        ...(input.numCtx ? { num_ctx: input.numCtx } : {}),
      }),
      signal: AbortSignal.timeout(input.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      throw new Error(`Chat completion request to ${url} timed out after ${input.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`);
    }
    throw e;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Chat completion request to ${url} failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`Chat completion response from ${url} had no message content`);
  }
  return content.trim();
}
