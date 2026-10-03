import { YoutubeTranscript } from "youtube-transcript";

export type YoutubeExtractionResult =
  | { ok: true; text: string; title: string | null }
  | { ok: false; reason: string };

// No API key needed — YouTube's public oEmbed endpoint. Best-effort: a
// failure here shouldn't fail the whole extraction, we just fall back to
// the raw URL as the item's title.
async function fetchTitle(url: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string };
    return data.title ?? null;
  } catch {
    return null;
  }
}

// V1 only supports YouTube for video, and only when a transcript/caption
// track exists — no audio transcription fallback yet (see TODO.md).
export async function extractYoutubeTranscript(url: string): Promise<YoutubeExtractionResult> {
  try {
    const [segments, title] = await Promise.all([
      YoutubeTranscript.fetchTranscript(url),
      fetchTitle(url),
    ]);
    const text = segments
      .map((s) => s.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) {
      return { ok: false, reason: "Transcript was empty" };
    }
    return { ok: true, text, title };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: `No transcript available: ${message}` };
  }
}
