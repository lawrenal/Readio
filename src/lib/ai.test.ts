import { describe, expect, it } from "vitest";
import { extractJson, takeSentences } from "./ai";

describe("extractJson", () => {
  it("parses a plain JSON object", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("pulls JSON out of surrounding prose", () => {
    expect(extractJson('Sure, here you go:\n{"a":1}\nHope that helps!')).toEqual({ a: 1 });
  });

  it("handles nested objects/arrays without over-matching", () => {
    const input = '{"a":{"b":[1,2,3]},"c":"d"}';
    expect(extractJson(input)).toEqual({ a: { b: [1, 2, 3] }, c: "d" });
  });

  it("stops at the object's real closing brace even if trailing text has braces", () => {
    // Regression test: a naive greedy regex (/\{[\s\S]*\}/) would capture
    // all the way to the final '}' below, well past the actual object.
    const input = '{"summary":"ok"}\nLet me know if you need more detail {just ask}.';
    expect(extractJson(input)).toEqual({ summary: "ok" });
  });

  it("ignores braces inside string values", () => {
    const input = '{"summary":"uses { and } in prose"}';
    expect(extractJson(input)).toEqual({ summary: "uses { and } in prose" });
  });

  it("throws when there's no JSON object at all", () => {
    expect(() => extractJson("no json here")).toThrow();
  });

  it("throws when braces never close", () => {
    expect(() => extractJson('{"a":1')).toThrow();
  });
});

describe("takeSentences", () => {
  it("returns the text unchanged when within the sentence limit", () => {
    const text = "First sentence. Second sentence.";
    expect(takeSentences(text, 3)).toBe(text);
  });

  it("truncates to the first N sentences when there are too many", () => {
    const text = "One. Two. Three. Four. Five.";
    expect(takeSentences(text, 3)).toBe("One. Two. Three.");
  });

  it("handles sentences ending in ! or ?", () => {
    const text = "Wait, really? Yes! And that's three. This is four.";
    expect(takeSentences(text, 3)).toBe("Wait, really? Yes! And that's three.");
  });

  it("returns the trimmed text as-is if sentence splitting finds nothing (no terminal punctuation)", () => {
    expect(takeSentences("no punctuation here", 3)).toBe("no punctuation here");
  });
});
