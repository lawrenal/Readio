import { describe, expect, it } from "vitest";
import { extractAudioBase64 } from "./tts-gemini";

describe("extractAudioBase64", () => {
  it("extracts audio data from a model_output step", () => {
    const response = {
      steps: [
        { type: "user_input", content: [{ type: "text", data: "hi" }] },
        { type: "model_output", content: [{ type: "audio", data: "QUJD" }] },
      ],
    };
    expect(extractAudioBase64(response)).toBe("QUJD");
  });

  it("returns the last audio chunk when multiple exist", () => {
    const response = {
      steps: [
        { type: "model_output", content: [{ type: "audio", data: "first" }] },
        { type: "model_output", content: [{ type: "audio", data: "second" }] },
      ],
    };
    expect(extractAudioBase64(response)).toBe("second");
  });

  it("returns null when there's no audio content", () => {
    expect(extractAudioBase64({ steps: [] })).toBeNull();
    expect(extractAudioBase64({})).toBeNull();
    expect(
      extractAudioBase64({ steps: [{ type: "model_output", content: [{ type: "text" }] }] }),
    ).toBeNull();
  });
});
