import { getSetting } from "./settings";
import { getAnthropicProvider, isAnthropicConfigured } from "./ai-anthropic";
import { getOpenAiProvider, isOpenAiConfigured } from "./ai-openai";
import { getXaiProvider, isXaiConfigured } from "./ai-xai";
import { getGeminiLlmProvider, isGeminiLlmConfigured } from "./ai-gemini";
import { getOpenWebUiProvider, isOpenWebUiConfigured } from "./ai-openwebui";
import { getOllamaProvider, isOllamaConfigured } from "./ai-ollama";

export interface LlmProvider {
  /**
   * Sends a single system+user turn, returns the model's text response.
   * `tier` distinguishes the cheap/bulk per-item summarization pass from
   * the quality-sensitive script-writing pass — only Anthropic actually
   * uses it (to pick between its two configured models, and to enable
   * extended thinking for the script tier); the other providers accept
   * it for interface compatibility and ignore it, since this project
   * only gives them one configurable model each.
   */
  complete(input: {
    system: string;
    user: string;
    maxTokens: number;
    tier: "summary" | "script";
    /** Overrides the provider's own default request timeout — used by
     * the /settings "Test connection" check to fail fast instead of
     * waiting the full production timeout on a dead/misconfigured
     * endpoint. Providers that don't take their own timeout (none
     * currently) would just ignore this. */
    timeoutMs?: number;
  }): Promise<string>;
}

const PROVIDER_FACTORIES: Record<string, () => Promise<LlmProvider>> = {
  anthropic: getAnthropicProvider,
  openai: getOpenAiProvider,
  xai: getXaiProvider,
  gemini: getGeminiLlmProvider,
  openwebui: getOpenWebUiProvider,
  ollama: getOllamaProvider,
};

const CONFIGURED_CHECKS: Record<string, () => Promise<boolean>> = {
  anthropic: isAnthropicConfigured,
  openai: isOpenAiConfigured,
  xai: isXaiConfigured,
  gemini: isGeminiLlmConfigured,
  openwebui: isOpenWebUiConfigured,
  ollama: isOllamaConfigured,
};

// OpenWebUI is the default — no paid API key required, in keeping with
// this being a self-hostable, DIY-first project. Both it and Anthropic
// are verified end-to-end against real episodes (see human-eyes.md); the
// other three (OpenAI, xAI, Gemini) are built against each provider's
// own current docs but not yet exercised against a real key. Ollama is
// also unverified directly (only reached via Open WebUI so far), though
// it shares its HTTP client with OpenWebUI/OpenAI/xAI.
function selectedProviderName(raw: string | undefined): string {
  return (raw || "openwebui").toLowerCase();
}

export async function isAiConfigured(): Promise<boolean> {
  const name = selectedProviderName(await getSetting("AI_PROVIDER"));
  const check = CONFIGURED_CHECKS[name];
  return check ? check() : false;
}

export async function getLlmProvider(): Promise<LlmProvider> {
  const name = selectedProviderName(await getSetting("AI_PROVIDER"));
  const factory = PROVIDER_FACTORIES[name];
  if (!factory) {
    throw new Error(
      `Unknown AI_PROVIDER "${name}" — expected one of: ${Object.keys(PROVIDER_FACTORIES).join(", ")}`,
    );
  }
  return factory();
}
