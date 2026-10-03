import Anthropic from "@anthropic-ai/sdk";
import { getSetting } from "./settings";
import type { LlmProvider } from "./llm";

export async function isAnthropicConfigured(): Promise<boolean> {
  return !!(await getSetting("ANTHROPIC_API_KEY"));
}

// See ai-openai-compatible.ts for why every provider here has one of
// these — a slow/unreachable provider shouldn't be able to hang a
// generation (and its lock) forever. Anthropic's own SDK supports a
// per-request timeout directly, so no manual AbortSignal needed here.
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

class AnthropicLlmProvider implements LlmProvider {
  constructor(private apiKey: string) {}

  async complete(input: {
    system: string;
    user: string;
    maxTokens: number;
    tier: "summary" | "script";
    timeoutMs?: number;
  }): Promise<string> {
    const anthropic = new Anthropic({ apiKey: this.apiKey });

    // Per-item summarization is a cheap, bulk, low-judgment extraction
    // task, so it defaults to Haiku. Script-writing (clustering +
    // narrative) is the quality-sensitive path a human actually listens
    // to, so it defaults to Opus. Both overridable via /settings (or
    // env). See human-eyes.md.
    const model =
      (await getSetting(input.tier === "script" ? "ANTHROPIC_SCRIPT_MODEL" : "ANTHROPIC_SUMMARY_MODEL")) ||
      (input.tier === "script" ? "claude-opus-5" : "claude-haiku-4-5");

    const response = await anthropic.messages.create(
      {
        model,
        max_tokens: input.maxTokens,
        // Extended thinking measurably helps the long-form clustering/
        // narrative quality of script-writing specifically — an
        // Anthropic-only capability, not exposed through the shared
        // LlmProvider interface, just applied internally here.
        ...(input.tier === "script" ? { thinking: { type: "adaptive" as const } } : {}),
        system: input.system,
        messages: [{ role: "user", content: input.user }],
      },
      { timeout: input.timeoutMs ?? DEFAULT_TIMEOUT_MS },
    );

    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") {
      throw new Error("Anthropic returned no text content");
    }
    return block.text.trim();
  }
}

export async function getAnthropicProvider(): Promise<AnthropicLlmProvider> {
  const apiKey = await getSetting("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — add it on /settings (or .env) to enable summarization/script generation. See human-eyes.md.",
    );
  }
  return new AnthropicLlmProvider(apiKey);
}
