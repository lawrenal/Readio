import { getSetting } from "./settings";
import { chatComplete } from "./ai-openai-compatible";
import type { LlmProvider } from "./llm";

const BASE_URL = "https://api.x.ai/v1";

// Per xAI's own current docs (docs.x.ai) — "grok-4.7" is their current
// flagship model as of this writing. Override via XAI_MODEL if it's
// moved on since.
const DEFAULT_MODEL = "grok-4.7";

export async function isXaiConfigured(): Promise<boolean> {
  return !!(await getSetting("XAI_API_KEY"));
}

class XaiProvider implements LlmProvider {
  constructor(
    private apiKey: string,
    private model: string,
  ) {}

  async complete(input: { system: string; user: string; maxTokens: number; timeoutMs?: number }): Promise<string> {
    return chatComplete({
      baseUrl: BASE_URL,
      apiKey: this.apiKey,
      model: this.model,
      system: input.system,
      user: input.user,
      maxTokens: input.maxTokens,
      timeoutMs: input.timeoutMs,
    });
  }
}

export async function getXaiProvider(): Promise<XaiProvider> {
  const apiKey = await getSetting("XAI_API_KEY");
  if (!apiKey) throw new Error("XAI_API_KEY is not set");
  const model = (await getSetting("XAI_MODEL")) || DEFAULT_MODEL;
  return new XaiProvider(apiKey, model);
}
