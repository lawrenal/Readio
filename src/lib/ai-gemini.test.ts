import { describe, expect, it } from "vitest";
import { extractText } from "./ai-gemini";

describe("extractText", () => {
  it("extracts text from a model_output step", () => {
    const response = {
      steps: [
        { type: "user_input", content: [{ type: "text", text: "hi" }] },
        { type: "model_output", content: [{ type: "text", text: "Hello there." }] },
      ],
    };
    expect(extractText(response)).toBe("Hello there.");
  });

  it("returns the last text chunk when multiple exist", () => {
    const response = {
      steps: [
        { type: "model_output", content: [{ type: "text", text: "first" }] },
        { type: "model_output", content: [{ type: "text", text: "second" }] },
      ],
    };
    expect(extractText(response)).toBe("second");
  });

  it("returns null when there's no text content", () => {
    expect(extractText({ steps: [] })).toBeNull();
    expect(extractText({})).toBeNull();
    expect(
      extractText({ steps: [{ type: "model_output", content: [{ type: "audio" }] }] }),
    ).toBeNull();
  });
});
