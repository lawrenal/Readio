import { writeFile } from "node:fs/promises";
import type { TtsProvider } from "./tts";
import { getAudioDurationSec } from "./tts";
import { splitIntoChunks } from "./text-chunking";
import { getSetting } from "./settings";

const DEFAULT_VOICE = "en-US-JennyNeural";

// Azure's docs state long input can produce audio that gets truncated at
// 10 minutes — that's a documented behavior, not a guess, so scripts are
// chunked defensively same as the other cloud providers. The character
// limit itself isn't documented; this is a conservative default.
const MAX_CHUNK_CHARS = 3000;

// Same reasoning as the LLM providers (see ai-openai-compatible.ts): a
// hung request must not hold the single generation lock forever.
const REQUEST_TIMEOUT_MS = 2 * 60 * 1000;

export async function isAzureConfigured(): Promise<boolean> {
  return !!(await getSetting("AZURE_SPEECH_KEY")) && !!(await getSetting("AZURE_SPEECH_REGION"));
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Exported for direct unit testing — the HTTP call needs a real key, but
// the SSML shape (and escaping untrusted-looking script text) is pure
// logic worth testing on its own.
export function buildSsml(text: string, voice: string, langCode: string): string {
  return (
    `<speak version='1.0' xml:lang='${escapeXml(langCode)}'>` +
    `<voice xml:lang='${escapeXml(langCode)}' name='${escapeXml(voice)}'>${escapeXml(text)}</voice>` +
    `</speak>`
  );
}

/**
 * Real narration via Azure AI Speech (Cognitive Services). Simplest of
 * the cloud options to authenticate — a single subscription key header,
 * no OAuth/service-account setup (contrast with the Google Cloud
 * provider). See human-eyes.md for confidence level vs. the other
 * providers.
 */
export class AzureTtsProvider implements TtsProvider {
  readonly fileExtension = "mp3";

  constructor(
    private apiKey: string,
    private region: string,
    private voice: string = DEFAULT_VOICE,
    private langCode: string = "en-US",
  ) {}

  private async synthesizeChunk(text: string): Promise<Buffer> {
    const url = `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": this.apiKey,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-160kbitrate-mono-mp3",
        "User-Agent": "readio",
      },
      body: buildSsml(text, this.voice, this.langCode),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Azure Speech request failed (${res.status}): ${body.slice(0, 300)}`);
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

export async function getAzureProvider(): Promise<AzureTtsProvider> {
  const apiKey = await getSetting("AZURE_SPEECH_KEY");
  const region = await getSetting("AZURE_SPEECH_REGION");
  if (!apiKey || !region) {
    throw new Error("AZURE_SPEECH_KEY and AZURE_SPEECH_REGION must both be set");
  }
  // Interpolated into the request hostname — anything beyond a plain
  // region name (e.g. "evil.example/x?") would send the key elsewhere.
  if (!/^[a-z0-9-]+$/i.test(region)) {
    throw new Error(`AZURE_SPEECH_REGION "${region}" doesn't look like an Azure region (e.g. eastus)`);
  }
  return new AzureTtsProvider(
    apiKey,
    region,
    await getSetting("AZURE_SPEECH_VOICE"),
    await getSetting("AZURE_SPEECH_LANGUAGE"),
  );
}
