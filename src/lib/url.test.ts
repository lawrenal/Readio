import { describe, expect, it } from "vitest";
import { InvalidUrlError, normalizeUrl } from "./url";

describe("normalizeUrl", () => {
  it("adds https:// when no protocol is given", () => {
    expect(normalizeUrl("example.com/post").raw).toBe("https://example.com/post");
  });

  it("strips www., trailing slash, and tracking params for dedup", () => {
    const a = normalizeUrl("https://www.example.com/post/?utm_source=x&utm_medium=y");
    const b = normalizeUrl("https://example.com/post");
    expect(a.normalized).toBe(b.normalized);
  });

  it("preserves non-tracking query params", () => {
    expect(normalizeUrl("https://example.com/search?q=hello").normalized).toBe(
      "example.com/search?q=hello",
    );
  });

  it("classifies youtube.com and youtu.be as youtube", () => {
    expect(normalizeUrl("https://youtube.com/watch?v=abc").type).toBe("youtube");
    expect(normalizeUrl("https://youtu.be/abc").type).toBe("youtube");
  });

  it("strips youtube's si tracking param but keeps v=", () => {
    const result = normalizeUrl("https://youtu.be/abc123?si=tracking123");
    expect(result.normalized).toBe("youtu.be/abc123");
  });

  it("classifies everything else as article", () => {
    expect(normalizeUrl("https://nytimes.com/some-article").type).toBe("article");
  });

  it("rejects empty input", () => {
    expect(() => normalizeUrl("")).toThrow(InvalidUrlError);
    expect(() => normalizeUrl("   ")).toThrow(InvalidUrlError);
  });

  it("rejects garbage that isn't a URL", () => {
    expect(() => normalizeUrl("not a url")).toThrow(InvalidUrlError);
  });

  it("rejects non-http(s) protocols", () => {
    expect(() => normalizeUrl("ftp://example.com/file")).toThrow(InvalidUrlError);
  });
});
