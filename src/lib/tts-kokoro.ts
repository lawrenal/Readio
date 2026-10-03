import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { TtsProvider } from "./tts";
import { splitIntoSentenceChunks } from "./text-chunking";
import { getSetting } from "./settings";
import { setGenerationStepProgress } from "./generation-status";

const execFileAsync = promisify(execFile);

// Top-graded American English voice per the model's own voice list
// (overallGrade "A", the single best of all 28 voices) and the library's
// own default — also happens to be female, which was asked for.
// Overridable via KOKORO_VOICE for any of the other 27 (see
// tts.list_voices() or the model card on Hugging Face for the full list).
const DEFAULT_VOICE = "af_heart";

// Measured empirically on this machine, not documented anywhere: a
// single generate() call has a hard output-length ceiling around 25.5s
// of audio, reached once input exceeds ~330-350 characters — beyond
// that, extra input is silently dropped (no error, no warning). Verified
// by probing input lengths from 50 to 3000 chars and observing where
// output duration stops scaling with input. 300 leaves real margin.
const MAX_CHUNK_CHARS = 300;

// The actual model loading + ONNX inference happens in this separate
// script/process, not here — see scripts/kokoro-synthesize.js for why
// (in-process, it blocked this server's entire event loop, including its
// own healthcheck, for the full duration of every episode generation).
const SYNTHESIZE_SCRIPT = path.join(process.cwd(), "scripts", "kokoro-synthesize.js");

/**
 * Real narration via Kokoro-82M, running fully locally (kokoro-js +
 * onnxruntime-node, no Python) — zero ongoing cost, no API key, no
 * network dependency after the model's first download. The one cloud
 * provider we could actually test end-to-end ourselves rather than take
 * on faith: verified real audio output, and specifically discovered
 * (empirically, since it's undocumented) the per-call output-length
 * ceiling that makes chunking mandatory here, not just defensive. See
 * human-eyes.md for how this compares to the cloud providers and to
 * `say`.
 */
export class KokoroTtsProvider implements TtsProvider {
  // Kokoro's raw output is uncompressed Float32 PCM WAV — ~83MB for a
  // 15-minute episode, vs. ~3.5MB from the mp3/m4a providers for the
  // same content. Compressed via `ffmpeg` (cross-platform, unlike the
  // `afconvert` this used originally) to keep episode files a
  // reasonable size for a podcast feed.
  readonly fileExtension = "m4a";

  constructor(private voice: string = DEFAULT_VOICE) {}

  async synthesize(text: string, outPath: string): Promise<{ durationSec: number }> {
    const chunks = splitIntoSentenceChunks(text, MAX_CHUNK_CHARS);

    const dir = await mkdtemp(path.join(tmpdir(), "readio-kokoro-"));
    const chunksPath = path.join(dir, "chunks.json");
    const resultPath = path.join(dir, "result.json");
    const progressPath = path.join(dir, "progress.json");

    // Polls the child process's progress file while synthesis runs, so
    // the UI can show real "chunk N of M" progress during the single
    // longest step of generation — not just a static "synthesizing"
    // spinner for however many minutes this takes. Cleared the moment
    // the child process settles, success or failure.
    const pollInterval = setInterval(async () => {
      try {
        const raw = await readFile(progressPath, "utf-8");
        const { completed, total } = JSON.parse(raw);
        if (total > 0) {
          setGenerationStepProgress(`chunk ${completed} of ${total}`, completed / total);
        }
      } catch {
        // Progress file doesn't exist yet (first chunk hasn't finished) — fine, just try again next tick.
      }
    }, 2000);

    try {
      await writeFile(chunksPath, JSON.stringify(chunks), "utf-8");

      // No timeout here (execFile's default) — a long, slow synthesis
      // run shouldn't be killed partway through. The caller (the nightly
      // cron, or a manual "generate now" click) is already prepared to
      // wait; running out-of-process is precisely what makes that wait
      // no longer cost the rest of the app its responsiveness.
      await execFileAsync("node", [SYNTHESIZE_SCRIPT, chunksPath, this.voice, outPath, resultPath, progressPath]);

      const result = JSON.parse(await readFile(resultPath, "utf-8"));
      return { durationSec: result.durationSec };
    } finally {
      clearInterval(pollInterval);
      await rm(dir, { recursive: true, force: true });
    }
  }
}

export async function getKokoroProvider(): Promise<KokoroTtsProvider> {
  return new KokoroTtsProvider(await getSetting("KOKORO_VOICE"));
}
