import { writeFile } from "node:fs/promises";
import type { TtsProvider } from "./tts";
import { getAudioDurationSec } from "./tts";
import { splitIntoChunks } from "./text-chunking";
import { getSetting } from "./settings";

const API_BASE = "https://api.elevenlabs.io/v1";
const DEFAULT_MODEL = "eleven_multilingual_v2";

// ElevenLabs doesn't publicly document a hard per-request character cap,
// and it likely varies by plan/model — this is a conservative chunk size
// chosen to stay well under any plan's limit, not a confirmed number.
// Splitting on paragraph boundaries also gives natural pauses between
// chunks when they're concatenated back together.
const MAX_CHUNK_CHARS = 2000;

// Same reasoning as the LLM providers (see ai-openai-compatible.ts): a
// hung request must not hold the single generation lock forever.
const REQUEST_TIMEOUT_MS = 2 * 60 * 1000;

export async function isElevenLabsConfigured(): Promise<boolean> {
  return !!(await getSetting("ELEVENLABS_API_KEY"));
}

/**
 * Real, natural-sounding narration via ElevenLabs. Used automatically
 * once ELEVENLABS_API_KEY is set — see getTtsProvider() in tts.ts, which
 * falls back to the macOS `say` provider otherwise.
 *
 * ElevenLabs outputs mp3 directly (no macOS-only conversion step needed,
 * unlike the `say` path). Long scripts are split into paragraph-aligned
 * chunks (see MAX_CHUNK_CHARS) and the resulting mp3s are concatenated —
 * raw byte concatenation, which works fine for mp3 playback since it's a
 * frame-based format, unlike containers like m4a that would need real
 * muxing.
 */
export class ElevenLabsTtsProvider implements TtsProvider {
  readonly fileExtension = "mp3";

  constructor(
    private apiKey: string,
    private voiceId: string,
    private modelId: string = DEFAULT_MODEL,
  ) {}

  private async synthesizeChunk(text: string): Promise<Buffer> {
    const res = await fetch(
      `${API_BASE}/text-to-speech/${encodeURIComponent(this.voiceId)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": this.apiKey,
        },
        body: JSON.stringify({ text, model_id: this.modelId }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ElevenLabs request failed (${res.status}): ${body.slice(0, 300)}`);
    }

    return Buffer.from(await res.arrayBuffer());
  }

  async synthesize(text: string, outPath: string): Promise<{ durationSec: number }> {
    const chunks = splitIntoChunks(text, MAX_CHUNK_CHARS);
    const audioBuffers: Buffer[] = [];
    for (const chunk of chunks) {
      audioBuffers.push(await this.synthesizeChunk(chunk));
    }

    await writeFile(outPath, Buffer.concat(audioBuffers));

    return { durationSec: await getAudioDurationSec(outPath) };
  }
}

export async function getElevenLabsProvider(): Promise<ElevenLabsTtsProvider> {
  const apiKey = await getSetting("ELEVENLABS_API_KEY");
  const voiceId = await getSetting("ELEVENLABS_VOICE_ID");
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");
  if (!voiceId) {
    throw new Error(
      "ELEVENLABS_VOICE_ID is not set — pick a voice from your ElevenLabs account " +
        "(Voice Library, or GET /v1/voices) and set its id on /settings (or .env)",
    );
  }
  return new ElevenLabsTtsProvider(apiKey, voiceId, await getSetting("ELEVENLABS_MODEL_ID"));
}
