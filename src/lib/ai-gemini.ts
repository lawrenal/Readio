import { getSetting } from "./settings";
import type { LlmProvider } from "./llm";

const API_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";

// Cross-checked via two independent fetches of Google's own current
// docs (the quickstart guide and the text-generation guide), which
// agreed — higher confidence than the Gemini TTS model id elsewhere in
// this project, where two doc fetches disagreed. Override via
// GEMINI_LLM_MODEL if this drifts.
const DEFAULT_MODEL = "gemini-3.8-flash";

// See ai-openai-compatible.ts for why this exists — a slow/unreachable
// provider shouldn't be able to hang a generation (and its lock) forever.
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export async function isGeminiLlmConfigured(): Promise<boolean> {
  return !!(await getSetting("GEMINI_API_KEY"));
}

type InteractionResponse = {
  steps?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

// Exported for direct unit testing — mirrors tts-gemini.ts's
// extractAudioBase64, same response shape, pulling text instead of
// audio out of it.
export function extractText(data: InteractionResponse): string | null {
  let last: string | null = null;
  for (const step of data.steps ?? []) {
    if (step.type !== "model_output") continue;
    for (const item of step.content ?? []) {
      if (item.type === "text" && item.text) last = item.text;
    }
  }
  return last;
}

class GeminiLlmProvider implements LlmProvider {
  constructor(
    private apiKey: string,
    private model: string,
  ) {}

  async complete(input: { system: string; user: string; maxTokens: number; timeoutMs?: number }): Promise<string> {
    let res: Response;
    try {
      res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "x-goog-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          input: input.user,
          system_instruction: input.system,
          // Field name is a reasonable best guess (the classic
          // generateContent API's equivalent is maxOutputTokens, and this
          // newer interactions API uses snake_case elsewhere in its
          // request body) — not confirmed against a documented example
          // the way the rest of this request shape was. If Gemini ignores
          // it, worst case is a longer-than-requested response, not a
          // hard failure.
          generation_config: { max_output_tokens: input.maxTokens },
        }),
        signal: AbortSignal.timeout(input.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
    } catch (e) {
      if (e instanceof Error && e.name === "TimeoutError") {
        throw new Error(`Gemini request timed out after ${input.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`);
      }
      throw e;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini request failed (${res.status}): ${body.slice(0, 300)}`);
    }

    const data = (await res.json()) as InteractionResponse;
    const text = extractText(data);
    if (!text) {
      throw new Error("Gemini response had no text content in the expected shape");
    }
    return text.trim();
  }
}

export async function getGeminiLlmProvider(): Promise<GeminiLlmProvider> {
  const apiKey = await getSetting("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const model = (await getSetting("GEMINI_LLM_MODEL")) || DEFAULT_MODEL;
  return new GeminiLlmProvider(apiKey, model);
}
