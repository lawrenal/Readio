import { writeFile } from "node:fs/promises";
import { GoogleAuth } from "google-auth-library";
import type { TtsProvider } from "./tts";
import { getAudioDurationSec } from "./tts";
import { splitIntoChunks } from "./text-chunking";
import { getSetting } from "./settings";

const DEFAULT_VOICE = "en-US-Chirp3-HD-Charon";
const DEFAULT_LANGUAGE = "en-US";

// Unlike ElevenLabs/Azure/Gemini, Google Cloud's Text-to-Speech API does
// not support plain API-key auth in any official example — every
// official Google doc uses an OAuth Bearer token (`gcloud auth
// print-access-token` or a service account). This means setup here is a
// real GCP project + service account, not just an API key. Confirmed
// against several official Google Cloud doc pages (quickstart, basics,
// regional-endpoint examples) — this is the one thing about this
// provider I'm confident is correct, even though the integration itself
// is untested end-to-end. See human-eyes.md.
//
// No documented hard character limit was found for this endpoint either;
// chunking defensively same as the others.
const MAX_CHUNK_CHARS = 3000;

// Same reasoning as the LLM providers (see ai-openai-compatible.ts): a
// hung request must not hold the single generation lock forever.
const REQUEST_TIMEOUT_MS = 2 * 60 * 1000;

export async function isGoogleConfigured(): Promise<boolean> {
  // GoogleAuth resolves credentials from GOOGLE_APPLICATION_CREDENTIALS
  // (or other ADC sources) itself — we just check the common case that a
  // key file path was actually set, so we can fail fast with a clear
  // message instead of a confusing auth error deep in a fetch call.
  return !!(await getSetting("GOOGLE_APPLICATION_CREDENTIALS"));
}

// Not cached across calls (unlike the old module-level singleton this
// replaced) — the key file path can now be overridden live via
// /settings, and passing `keyFile` explicitly (rather than relying on
// GoogleAuth's own GOOGLE_APPLICATION_CREDENTIALS env lookup) is what
// makes that override actually take effect without a restart.
async function getAuth(): Promise<GoogleAuth> {
  const keyFile = await getSetting("GOOGLE_APPLICATION_CREDENTIALS");
  return new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    keyFile,
  });
}

/**
 * Real narration via Google Cloud Text-to-Speech (Neural2/Chirp3-HD
 * voices). Requires a GCP project + service account JSON key
 * (GOOGLE_APPLICATION_CREDENTIALS) — meaningfully more setup than the
 * other providers here, which just need an API key. See human-eyes.md.
 */
export class GoogleTtsProvider implements TtsProvider {
  readonly fileExtension = "mp3";

  constructor(
    private voiceName: string = DEFAULT_VOICE,
    private languageCode: string = DEFAULT_LANGUAGE,
  ) {}

  private async synthesizeChunk(text: string): Promise<Buffer> {
    const client = await (await getAuth()).getClient();
    const accessToken = await client.getAccessToken();
    const token = typeof accessToken === "string" ? accessToken : accessToken?.token;
    if (!token) throw new Error("Failed to obtain a Google Cloud access token");

    const res = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: this.languageCode, name: this.voiceName },
        audioConfig: { audioEncoding: "MP3" },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Google Cloud TTS request failed (${res.status}): ${body.slice(0, 300)}`);
    }

    const data = (await res.json()) as { audioContent?: string };
    if (!data.audioContent) {
      throw new Error("Google Cloud TTS response had no audioContent field");
    }
    return Buffer.from(data.audioContent, "base64");
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

export async function getGoogleProvider(): Promise<GoogleTtsProvider> {
  if (!(await isGoogleConfigured())) {
    throw new Error(
      "GOOGLE_APPLICATION_CREDENTIALS is not set — point it at a GCP service account JSON " +
        "key file with Cloud Text-to-Speech access",
    );
  }
  return new GoogleTtsProvider(await getSetting("GOOGLE_TTS_VOICE"), await getSetting("GOOGLE_TTS_LANGUAGE"));
}
