import { writeFile } from "node:fs/promises";
import type { TtsProvider } from "./tts";
import { getAudioDurationSec } from "./tts";
import { getSetting } from "./settings";

const API_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const DEFAULT_MODEL = "gemini-3.1-flash-tts";
const DEFAULT_VOICE = "Kore";

// Same reasoning as the LLM providers (see ai-openai-compatible.ts): a
// hung request must not hold the single generation lock forever.
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

// LEAST CONFIDENT of the four TTS providers here. Verified against two
// separate fetches of Google's docs, both agreeing on this endpoint/body
// shape (google.dev/gemini-api/docs/speech-generation and
// /audio-generation), but this is a newer, less-established API surface
// than Azure/ElevenLabs/Google Cloud TTS, none of it has been exercised
// against a real key, and the exact model id may be wrong — the two doc
// fetches disagreed on the version digit ("gemini-3.1" vs "gemini-3.8");
// this picks 3.1 because independent web search results (not doc
// fetches) cross-referenced that name as a real current product, but
// override GEMINI_TTS_MODEL if this is wrong.
//
// No chunking here (unlike the other three providers) — Gemini's
// response is a WAV file (RIFF header + PCM data), and naively
// concatenating multiple complete WAV files like the mp3 providers do
// would produce a corrupt result (the header only describes the first
// chunk's length). Proper WAV concatenation would need to parse and
// rebuild the header across chunks — not implemented, so long scripts
// may hit an undocumented length limit here before the other providers
// would. Revisit if this becomes the provider actually used long-term.
export async function isGeminiConfigured(): Promise<boolean> {
  return !!(await getSetting("GEMINI_API_KEY"));
}

type InteractionResponse = {
  steps?: Array<{
    type?: string;
    content?: Array<{ type?: string; data?: string }>;
  }>;
};

// Exported for direct unit testing — the HTTP call needs a real key.
export function extractAudioBase64(data: InteractionResponse): string | null {
  let last: string | null = null;
  for (const step of data.steps ?? []) {
    if (step.type !== "model_output") continue;
    for (const item of step.content ?? []) {
      if (item.type === "audio" && item.data) last = item.data;
    }
  }
  return last;
}

/**
 * Real narration via Gemini's TTS model. Simple API-key auth like
 * ElevenLabs/Azure, but see the confidence warning above — this is the
 * shakiest of the four integrations built today.
 */
export class GeminiTtsProvider implements TtsProvider {
  readonly fileExtension = "wav";

  constructor(
    private apiKey: string,
    private voice: string = DEFAULT_VOICE,
    private model: string = DEFAULT_MODEL,
  ) {}

  async synthesize(text: string, outPath: string): Promise<{ durationSec: number }> {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-goog-api-key": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: [{ type: "user_input", content: [{ type: "text", text }] }],
        response_format: { type: "audio", mime_type: "audio/wav", sample_rate: 24000 },
        generation_config: { speech_config: [{ voice: this.voice }] },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini TTS request failed (${res.status}): ${body.slice(0, 300)}`);
    }

    const data = (await res.json()) as InteractionResponse;
    const audioBase64 = extractAudioBase64(data);
    if (!audioBase64) {
      throw new Error("Gemini TTS response had no audio content in the expected shape");
    }

    await writeFile(outPath, Buffer.from(audioBase64, "base64"));

    return { durationSec: await getAudioDurationSec(outPath) };
  }
}

export async function getGeminiProvider(): Promise<GeminiTtsProvider> {
  const apiKey = await getSetting("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return new GeminiTtsProvider(apiKey, await getSetting("GEMINI_TTS_VOICE"), await getSetting("GEMINI_TTS_MODEL"));
}
