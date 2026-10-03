import { describe, expect, it } from "vitest";
import { splitIntoChunks, splitIntoSentenceChunks } from "./text-chunking";

describe("splitIntoChunks", () => {
  it("returns a single chunk for short text", () => {
    const text = "Paragraph one.\n\nParagraph two.";
    expect(splitIntoChunks(text, 2000)).toEqual([text]);
  });

  it("splits on paragraph boundaries once the limit is exceeded", () => {
    const para = "x".repeat(1500);
    const text = [para, para, para].join("\n\n"); // 3 paragraphs, ~4500 chars total
    const chunks = splitIntoChunks(text, 2000);

    // Each chunk should stay under the limit, and every char should survive.
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(2000);
    }
    expect(chunks.join("\n\n")).toBe(text);
  });

  it("force-splits a single paragraph longer than the chunk size", () => {
    const hugeParagraph = "y".repeat(5000);
    const chunks = splitIntoChunks(hugeParagraph, 2000);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(2000);
    }
    expect(chunks.join("")).toBe(hugeParagraph);
  });

  it("never produces an empty chunk", () => {
    const text = "Paragraph one.\n\n\n\nParagraph two.";
    const chunks = splitIntoChunks(text, 2000);
    for (const chunk of chunks) {
      expect(chunk.length).toBeGreaterThan(0);
    }
  });

  it("respects a different max size per call", () => {
    const text = "a".repeat(300);
    const chunks = splitIntoChunks(text, 100);
    expect(chunks.length).toBe(3);
  });
});

describe("splitIntoSentenceChunks", () => {
  it("returns a single chunk when everything fits", () => {
    const text = "First sentence. Second sentence.";
    expect(splitIntoSentenceChunks(text, 300)).toEqual([text]);
  });

  it("splits on sentence boundaries once the limit is exceeded", () => {
    const sentence = "This is a sentence of a certain length for testing purposes. ";
    const text = sentence.repeat(20); // well over 300 chars
    const chunks = splitIntoSentenceChunks(text, 300);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(300);
    }
    // No words lost — every sentence's text survives across the chunks.
    expect(chunks.join(" ").replace(/\s+/g, " ").trim()).toBe(text.replace(/\s+/g, " ").trim());
  });

  it("hard-splits a single sentence longer than the limit at word boundaries", () => {
    const hugeSentence = Array.from({ length: 100 }, (_, i) => `word${i}`).join(" ") + ".";
    const chunks = splitIntoSentenceChunks(hugeSentence, 50);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(50);
    }
  });

  it("never produces an empty chunk", () => {
    const text = "One.   Two.    Three.";
    const chunks = splitIntoSentenceChunks(text, 300);
    for (const chunk of chunks) {
      expect(chunk.length).toBeGreaterThan(0);
    }
  });
});
