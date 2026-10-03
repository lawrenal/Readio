import { getSetting } from "./settings";
import { chatComplete } from "./ai-openai-compatible";
import type { LlmProvider } from "./llm";

/**
 * Self-hosted Open WebUI (fronting Ollama/Llama/etc.), via its own
 * OpenAI-compatible /api/chat/completions endpoint. Unlike the other
 * four providers, there's no universal default base URL or model —
 * this is inherently instance-specific (your own server, your own
 * loaded model), so both are required config, not just overrides of a
 * sensible default.
 */
export async function isOpenWebUiConfigured(): Promise<boolean> {
  return !!(await getSetting("OPENWEBUI_BASE_URL")) && !!(await getSetting("OPENWEBUI_MODEL"));
}

class OpenWebUiProvider implements LlmProvider {
  constructor(
    private baseUrl: string,
    private apiKey: string | undefined,
    private model: string,
  ) {}

  async complete(input: { system: string; user: string; maxTokens: number; timeoutMs?: number }): Promise<string> {
    return chatComplete({
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      model: this.model,
      system: input.system,
      user: input.user,
      maxTokens: input.maxTokens,
      timeoutMs: input.timeoutMs,
    });
  }
}

export async function getOpenWebUiProvider(): Promise<OpenWebUiProvider> {
  const baseUrl = await getSetting("OPENWEBUI_BASE_URL");
  const model = await getSetting("OPENWEBUI_MODEL");
  if (!baseUrl) {
    throw new Error(
      "OPENWEBUI_BASE_URL is not set — point it at your Open WebUI instance's API base, e.g. http://192.168.1.50:3000/api",
    );
  }
  if (!model) {
    throw new Error("OPENWEBUI_MODEL is not set — the model name exactly as loaded in Open WebUI, e.g. llama3.3");
  }
  // Optional — many local Open WebUI setups run without auth on a trusted LAN.
  const apiKey = await getSetting("OPENWEBUI_API_KEY");
  return new OpenWebUiProvider(baseUrl, apiKey, model);
}
