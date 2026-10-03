#!/usr/bin/env node
// Runs Kokoro's ONNX synthesis in a separate OS process, deliberately not
// inside the main Next.js server. Kokoro's generate() call is CPU-bound
// native work (onnxruntime-node) that runs synchronously from the calling
// thread's perspective -- doing it in-process blocked the whole app,
// including its own Docker healthcheck, for the entire duration of every
// episode generation (confirmed for real against the home-lab container:
// ~16 minutes of total unresponsiveness for a single-item episode). See
// tts-kokoro.ts for the caller and human-eyes.md for how this was found.
//
// Deliberately plain CommonJS, not bundled by Next.js/Turbopack -- same
// reasoning as scripts/copy-kokoro-voices.js: a raw `node <this file>`
// invocation needs a real file at a predictable path in every environment
// (dev, `next start`, Docker), and Turbopack only reliably bundles code
// that's actually imported by the app, not a separate process entry point.
//
// Trade-off worth knowing: the model is no longer cached across calls in
// a long-running process (it was, in-process, via a module-level
// singleton) -- every invocation of this script reloads it fresh. Fine
// for the real use case (once a night), slower if you're manually
// re-triggering generation repeatedly in a dev session.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

async function main() {
  const [, , chunksPath, voice, outPath, resultPath, progressPath] = process.argv;
  if (!chunksPath || !voice || !outPath || !resultPath) {
    throw new Error(
      "Usage: kokoro-synthesize.js <chunksJsonPath> <voice> <outPath> <resultJsonPath> [progressJsonPath]",
    );
  }

  // Requiring these here (not at top-level) keeps a `--help`-style usage
  // error fast and dependency-free; harmless either way otherwise.
  const { KokoroTTS } = require("kokoro-js");
  const { RawAudio, env: transformersEnv } = require("@huggingface/transformers");

  // Must match the cache path tts-kokoro.ts used to set for the in-process
  // model -- same directory, same reasoning (survives container restarts
  // via the data/ volume instead of re-downloading the ~90MB model).
  transformersEnv.cacheDir = path.join(process.cwd(), "data", "models");

  const chunks = JSON.parse(fs.readFileSync(chunksPath, "utf-8"));
  const tts = await KokoroTTS.from_pretrained(MODEL_ID, { dtype: "q8", device: "cpu" });

  const audios = [];
  for (const chunk of chunks) {
    audios.push(await tts.generate(chunk, { voice }));
    // Optional — the parent process polls this file to relay chunk-level
    // progress into the UI during the longest step of generation. Written
    // as a plain file rather than stdout for the same reason the final
    // result is: kokoro-js/onnxruntime-node may write their own
    // diagnostic output to stdout, which would collide with anything
    // meant to be parsed from there.
    if (progressPath) {
      fs.writeFileSync(progressPath, JSON.stringify({ completed: audios.length, total: chunks.length }));
    }
  }

  // Concatenate at the raw-sample level (before WAV encoding), not by
  // stitching encoded WAV files -- each WAV carries a header describing
  // its own length, so naive file-level concatenation would corrupt the
  // result. All chunks share one voice/model, so sample rate is uniform.
  const sampleRate = audios[0].sampling_rate;
  const totalSamples = audios.reduce((sum, a) => sum + a.audio.length, 0);
  const merged = new Float32Array(totalSamples);
  let offset = 0;
  for (const a of audios) {
    merged.set(a.audio, offset);
    offset += a.audio.length;
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "link-podcast-kokoro-"));
  const wavPath = path.join(dir, "out.wav");
  try {
    const finalAudio = new RawAudio(merged, sampleRate);
    await finalAudio.save(wavPath);
    await execFileAsync("ffmpeg", ["-y", "-i", wavPath, "-c:a", "aac", "-b:a", "128k", outPath]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // Written to a file rather than printed to stdout -- kokoro-js/
  // onnxruntime-node may write their own diagnostic output to stdout, and
  // a stray line would silently corrupt a JSON.parse on the caller's end.
  fs.writeFileSync(resultPath, JSON.stringify({ durationSec: Math.round(totalSamples / sampleRate) }));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
