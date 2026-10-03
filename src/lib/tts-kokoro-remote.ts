import { writeFile } from "node:fs/promises";
import type { TtsProvider } from "./tts";
import { getAudioDurationSec } from "./tts";
import { splitIntoSentenceChunks } from "./text-chunking";
import { getSetting } from "./settings";

/**
 * Offloads Kokoro synthesis to a separate, faster machine over HTTP,
 * instead of running the ONNX model in-process on whatever's hosting
 * this app. Built against the OpenAI TTS API shape
 * (`POST /v1/audio/speech`, `{model, input, voice, response_format}`,
 * raw audio bytes back) because that's exactly what the common
 * self-hosted Kokoro server wrappers speak — confirmed against both:
 *   - Kokoro-FastAPI (github.com/remsky/Kokoro-FastAPI) — Dockerized,
 *     runs anywhere (CPU/AMD/NVIDIA).
 *   - mlx-audio (github.com/Blaizzy/mlx-audio) — built on Apple's MLX
 *     framework specifically, i.e. real Metal acceleration on Apple
 *     Silicon rather than generic CPU ONNX. This is almost certainly
 *     the one you want pointed at a Mac — it's the actual speed win,
 *     not just moving the same slow work to a different machine.
 * Either one (or anything else that speaks this same API shape) works
 * here without any code changes, just point KOKORO_REMOTE_BASE_URL at it.
 */
const DEFAULT_VOICE = "af_heart";
const DEFAULT_MODEL = "kokoro";

// Same tight per-chunk limit as local Kokoro (tts-kokoro.ts) — both wrap
// the same underlying Kokoro-82M model, which has a real per-call output
// ceiling regardless of which server wraps it. Unconfirmed whether
// Kokoro-FastAPI/mlx-audio already chunk long input internally (Kokoro-
// FastAPI advertises "auto-stitching," which suggests maybe), but
// chunking defensively here costs little and avoids a repeat of the
// silent-truncation bug local Kokoro actually hit.
const MAX_CHUNK_CHARS = 300;

// Real network call to (hopefully) much faster hardware — shouldn't
// normally take long per chunk, but generous enough to tolerate a cold
// model load on the remote server's first request.
const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000;

export async function isKokoroRemoteConfigured(): Promise<boolean> {
  return !!(await getSetting("KOKORO_REMOTE_BASE_URL"));
}

export class RemoteKokoroTtsProvider implements TtsProvider {
  // mp3 — same reasoning as the cloud providers in this codebase: raw
  // byte concatenation across chunks is safe for mp3 (frame-based),
  // unlike wav (header describes the whole file's length up front) or
  // containers like m4a that would need real muxing.
  readonly fileExtension = "mp3";

  constructor(
    private baseUrl: string,
    private apiKey: string | undefined,
    private voice: string,
    private model: string,
  ) {}

  private async synthesizeChunk(text: string): Promise<Buffer> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/audio/speech`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.model,
          input: text,
          voice: this.voice,
          response_format: "mp3",
        }),
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });
    } catch (e) {
      if (e instanceof Error && e.name === "TimeoutError") {
        throw new Error(`Remote Kokoro request to ${url} timed out after ${DEFAULT_TIMEOUT_MS}ms`);
      }
      throw e;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Remote Kokoro request to ${url} failed (${res.status}): ${body.slice(0, 300)}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  async synthesize(text: string, outPath: string): Promise<{ durationSec: number }> {
    const chunks = splitIntoSentenceChunks(text, MAX_CHUNK_CHARS);
    const audioBuffers: Buffer[] = [];
    for (const chunk of chunks) {
      audioBuffers.push(await this.synthesizeChunk(chunk));
    }

    await writeFile(outPath, Buffer.concat(audioBuffers));
    return { durationSec: await getAudioDurationSec(outPath) };
  }
}

export async function getKokoroRemoteProvider(): Promise<RemoteKokoroTtsProvider> {
  const baseUrl = await getSetting("KOKORO_REMOTE_BASE_URL");
  if (!baseUrl) {
    throw new Error(
      "KOKORO_REMOTE_BASE_URL is not set — point it at your remote Kokoro server, e.g. http://192.168.1.50:8880/v1",
    );
  }
  const voice = (await getSetting("KOKORO_REMOTE_VOICE")) || DEFAULT_VOICE;
  const model = (await getSetting("KOKORO_REMOTE_MODEL")) || DEFAULT_MODEL;
  const apiKey = await getSetting("KOKORO_REMOTE_API_KEY");
  return new RemoteKokoroTtsProvider(baseUrl, apiKey, voice, model);
}
