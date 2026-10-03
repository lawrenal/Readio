import { getSetting } from "./settings";
import { chatComplete } from "./ai-openai-compatible";
import type { LlmProvider } from "./llm";

/**
 * Direct connection to a self-hosted Ollama instance, via its own
 * built-in OpenAI-compatible /v1/chat/completions endpoint — no Open
 * WebUI layer needed in between. Confirmed against Ollama's own docs:
 * default port 11434, no auth by default (their official clients pass a
 * dummy non-empty API key only because the OpenAI SDK itself refuses to
 * construct a client with an empty one — since this project talks to it
 * via plain fetch(), not that SDK, there's no such requirement here; an
 * Authorization header is simply omitted when no key is configured).
 *
 * Deliberately no default base URL, even though Ollama's own default
 * port (11434) is well-known — this app runs in Docker, where
 * "localhost" resolves to the container itself, not the host machine
 * Ollama is actually running on. A convenient-looking default here would
 * silently fail in this project's main deployment target. Require the
 * real LAN address explicitly instead, same as Open WebUI's setting.
 */
export async function isOllamaConfigured(): Promise<boolean> {
  return !!(await getSetting("OLLAMA_BASE_URL")) && !!(await getSetting("OLLAMA_MODEL"));
}

// Found for real: Ollama's OpenAI-compatible endpoint silently truncates
// context to 4096 tokens regardless of the model's actual capability,
// discarding the oldest part of a long prompt with no error — easy to
// never notice, since nothing fails, the output just gets worse/weirder
// as grounding gets silently dropped. This app's script-writing prompt
// routinely includes a full day's worth of article text, which can
// exceed 4096 tokens on even a moderately busy day. Defaulting to 16384
// here (rather than leaving Ollama's own stingy default in place) is a
// deliberate improvement over doing nothing — override via
// OLLAMA_NUM_CTX if your model/hardware wants more (or less, if memory
// is tight).
const DEFAULT_NUM_CTX = 16384;

class OllamaProvider implements LlmProvider {
  constructor(
    private baseUrl: string,
    private apiKey: string | undefined,
    private model: string,
    private numCtx: number,
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
      numCtx: this.numCtx,
    });
  }
}

export async function getOllamaProvider(): Promise<OllamaProvider> {
  const baseUrl = await getSetting("OLLAMA_BASE_URL");
  if (!baseUrl) {
    throw new Error(
      "OLLAMA_BASE_URL is not set — point it at your Ollama instance, e.g. http://192.168.1.50:11434/v1 (not localhost — this app runs in Docker, which has its own localhost)",
    );
  }
  const model = await getSetting("OLLAMA_MODEL");
  if (!model) {
    throw new Error("OLLAMA_MODEL is not set — the model name exactly as pulled in Ollama, e.g. qwen3:8b");
  }
  // Optional — Ollama has no auth by default; only needed if it's sitting behind a reverse proxy that adds one.
  const apiKey = await getSetting("OLLAMA_API_KEY");
  const numCtxRaw = await getSetting("OLLAMA_NUM_CTX");
  const numCtx = numCtxRaw ? parseInt(numCtxRaw, 10) : DEFAULT_NUM_CTX;
  return new OllamaProvider(baseUrl, apiKey, model, Number.isFinite(numCtx) ? numCtx : DEFAULT_NUM_CTX);
}
