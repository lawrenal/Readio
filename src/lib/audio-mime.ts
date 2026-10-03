import path from "node:path";

// Content-type is derived from the file actually on disk, not from
// whichever TtsProvider is configured right now — old episodes generated
// by a different provider (e.g. m4a from `say` before an ElevenLabs key
// was added) still need to serve correctly.
const MIME_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
};

export function mimeTypeForAudioPath(audioPath: string): string {
  const ext = path.extname(audioPath).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}
