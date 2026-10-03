// Shared by the cloud TTS providers that need to split long scripts into
// multiple requests. Each provider has its own (sometimes undocumented,
// sometimes documented-but-conservatively-undershot) per-request text
// limit — see each provider's file for the specific number and source.
export function splitIntoChunks(text: string, maxChars: number): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxChars && current) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);

  // A single paragraph longer than the chunk size on its own still needs
  // to be split further, or it'd be sent as one oversized request.
  return chunks.flatMap((chunk) => {
    if (chunk.length <= maxChars) return [chunk];
    const pieces: string[] = [];
    for (let i = 0; i < chunk.length; i += maxChars) {
      pieces.push(chunk.slice(i, i + maxChars));
    }
    return pieces;
  });
}

// For Kokoro specifically (see tts-kokoro.ts): a single generate() call has
// a hard output-length ceiling — measured empirically at ~330 input chars,
// beyond which the model silently stops producing audio for the rest of
// the text instead of erroring. Paragraph-sized chunks are far too big
// for that limit, so this splits on sentence boundaries instead. The
// sentence regex is a simple heuristic (splits on . ! ? followed by
// whitespace) and will mishandle things like "Mr. Smith" or "3.14" by
// treating them as sentence ends — acceptable here since a slightly
// early split just means an extra chunk boundary, not lost content.
export function splitIntoSentenceChunks(text: string, maxChars: number): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0);
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > maxChars && current) {
      chunks.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);

  // A single sentence longer than the limit on its own (rare, but
  // possible) still needs a hard word-boundary split.
  return chunks.flatMap((chunk) => {
    if (chunk.length <= maxChars) return [chunk];
    const words = chunk.split(" ");
    const pieces: string[] = [];
    let piece = "";
    for (const word of words) {
      const candidate = piece ? `${piece} ${word}` : word;
      if (candidate.length > maxChars && piece) {
        pieces.push(piece);
        piece = word;
      } else {
        piece = candidate;
      }
    }
    if (piece) pieces.push(piece);
    return pieces;
  });
}
