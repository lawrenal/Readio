import { NextResponse } from "next/server";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getTtsProvider } from "@/lib/tts";

// Synthesizes one short sentence through whichever TTS provider is
// currently configured — the real synthesize() path (including, for
// Kokoro, real model loading and a real ffmpeg conversion), just with
// minimal text instead of a full episode script. Bounded by a timeout
// so a misconfigured/unreachable provider fails fast rather than
// leaving you guessing; TtsProvider.synthesize() itself has no timeout
// by design for real generation (see tts-kokoro.ts), so this wraps the
// call in a race here instead of changing that contract. Note: racing
// doesn't cancel the underlying work — if this times out, Kokoro's
// child process (if that's the active provider) keeps running in the
// background until it finishes on its own; harmless, just slightly
// wasteful, and not worth the complexity of real cancellation for a
// manual settings-page check.
const TEST_TIMEOUT_MS = 90_000;
const TEST_TEXT = "This is a connection test.";

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms));
}

export async function POST() {
  const startedAt = Date.now();
  const dir = await mkdtemp(path.join(tmpdir(), "readio-tts-test-"));
  try {
    const tts = await getTtsProvider();
    const outPath = path.join(dir, `test.${tts.fileExtension}`);

    const { durationSec } = await Promise.race([tts.synthesize(TEST_TEXT, outPath), timeout(TEST_TIMEOUT_MS)]);
    const { size } = await stat(outPath);

    return NextResponse.json({
      ok: true,
      durationSec,
      fileSizeBytes: size,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      elapsedMs: Date.now() - startedAt,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
