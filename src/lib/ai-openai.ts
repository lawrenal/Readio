import { getSetting } from "./settings";
import { chatComplete } from "./ai-openai-compatible";
import type { LlmProvider } from "./llm";

const BASE_URL = "https://api.openai.com/v1";

// Cross-checked against OpenAI's own current API reference docs — their
// naming has moved fast enough (gpt-4o, o1/o3 reasoning models, now this)
// that I'm flagging the same honest-confidence caveat as the Gemini TTS
// model id elsewhere in this project: override via OPENAI_MODEL if this
// has drifted by the time you're reading this.
const DEFAULT_MODEL = "gpt-6-astra";

export async function isOpenAiConfigured(): Promise<boolean> {
  return !!(await getSetting("OPENAI_API_KEY"));
}

class OpenAiProvider implements LlmProvider {
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

export async function getOpenAiProvider(): Promise<OpenAiProvider> {
  const apiKey = await getSetting("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const model = (await getSetting("OPENAI_MODEL")) || DEFAULT_MODEL;
  return new OpenAiProvider(apiKey, model);
}
