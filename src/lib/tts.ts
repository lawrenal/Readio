import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getElevenLabsProvider } from "./tts-elevenlabs";
import { getAzureProvider } from "./tts-azure";
import { getGoogleProvider } from "./tts-google";
import { getGeminiProvider } from "./tts-gemini";
import { getKokoroProvider } from "./tts-kokoro";
import { getKokoroRemoteProvider } from "./tts-kokoro-remote";
import { getSetting } from "./settings";

const execFileAsync = promisify(execFile);

export interface TtsProvider {
  /** File extension (no dot) this provider's output should be saved with. */
  readonly fileExtension: string;
  /** Synthesizes `text` and writes an audio file to `outPath`. Returns duration in seconds. */
  synthesize(text: string, outPath: string): Promise<{ durationSec: number }>;
}

/**
 * Shared by every provider. Originally shelled out to macOS's `afinfo`;
 * switched to `ffprobe` (part of ffmpeg) so this — and the whole app —
 * runs on Linux, not just macOS. ffprobe is cross-platform and was
 * chosen deliberately over `afinfo`/`afconvert` for that reason once
 * containerizing for a home-lab Docker host became the goal; see
 * human-eyes.md for what is and isn't verified about this on Linux
 * specifically (built and reasoned through carefully, but this
 * environment has no Docker daemon to actually run it in).
 */
export async function getAudioDurationSec(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "json",
    filePath,
  ]);
  let parsed: { format?: { duration?: string } };
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`Couldn't parse ffprobe JSON output: ${stdout.slice(0, 200)}`);
  }
  const duration = parsed.format?.duration;
  if (!duration) {
    // Fail loudly rather than silently persisting durationSec: 0 — a
    // wrong-but-visible error beats an episode with a bogus duration and
    // no indication anything went wrong.
    throw new Error(`ffprobe output had no format.duration: ${stdout.slice(0, 200)}`);
  }
  return Math.round(parseFloat(duration));
}

/**
 * macOS's built-in `say`, converted to AAC/.m4a via `ffmpeg`. Free, zero
 * setup, works fully offline. Quality (even the paid "Enhanced" voice
 * downloads) was judged not natural enough for real use (see
 * human-eyes.md) — Kokoro-82M is the actual default now. Kept around as
 * an explicit-only option (`TTS_PROVIDER=say`), not a fallback in the
 * default chain. `say` itself has no Linux equivalent, so this provider
 * is macOS-only regardless of the ffmpeg swap — guarded below rather
 * than left to fail with a confusing "command not found".
 */
export class SayTtsProvider implements TtsProvider {
  readonly fileExtension = "m4a";

  constructor(private voice?: string) {}

  async synthesize(text: string, outPath: string): Promise<{ durationSec: number }> {
    if (process.platform !== "darwin") {
      throw new Error(
        "TTS_PROVIDER=say only works on macOS (it shells out to the built-in `say` command, " +
          "which doesn't exist on Linux). Use TTS_PROVIDER=kokoro or a cloud provider instead.",
      );
    }

    const dir = await mkdtemp(path.join(tmpdir(), "readio-tts-"));
    const textPath = path.join(dir, "script.txt");
    const aiffPath = path.join(dir, "out.aiff");

    try {
      await writeFile(textPath, text, "utf-8");

      const sayArgs = ["-f", textPath, "-o", aiffPath];
      if (this.voice) sayArgs.push("-v", this.voice);
      await execFileAsync("say", sayArgs);

      await execFileAsync("ffmpeg", ["-y", "-i", aiffPath, "-c:a", "aac", "-b:a", "128k", outPath]);

      return { durationSec: await getAudioDurationSec(outPath) };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

const PROVIDER_FACTORIES: Record<string, () => Promise<TtsProvider>> = {
  elevenlabs: getElevenLabsProvider,
  azure: getAzureProvider,
  google: getGoogleProvider,
  gemini: getGeminiProvider,
  kokoro: getKokoroProvider,
  "kokoro-remote": getKokoroRemoteProvider,
  say: async () => new SayTtsProvider(await getSetting("SAY_VOICE")),
};

/**
 * Kokoro-82M (self-hosted, no key needed) is the unconditional default —
 * it's the one TTS provider that's actually been listened to and judged
 * good, so it wins even if a cloud key happens to be sitting in `.env`
 * from earlier testing. `TTS_PROVIDER` overrides this explicitly for
 * anything else (a cloud provider, or `say`); there's no auto-detection
 * cascade through cloud keys anymore — one predictable default, explicit
 * opt-in for everything else. Reads live via getSetting() (database
 * override, falling back to env) so a change saved on /settings takes
 * effect on the very next episode generation, no restart needed.
 */
export async function getTtsProvider(): Promise<TtsProvider> {
  const explicit = (await getSetting("TTS_PROVIDER"))?.toLowerCase();
  if (!explicit) return getKokoroProvider();

  const factory = PROVIDER_FACTORIES[explicit];
  if (!factory) {
    throw new Error(
      `Unknown TTS_PROVIDER "${explicit}" — expected one of: ${Object.keys(PROVIDER_FACTORIES).join(", ")}`,
    );
  }
  return factory();
}
