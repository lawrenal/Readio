import { describe, expect, it } from "vitest";
import { buildSsml } from "./tts-azure";

describe("buildSsml", () => {
  it("wraps text in a speak/voice element with the given voice and language", () => {
    const ssml = buildSsml("Hello there.", "en-US-JennyNeural", "en-US");
    expect(ssml).toContain("<speak version='1.0' xml:lang='en-US'>");
    expect(ssml).toContain("<voice xml:lang='en-US' name='en-US-JennyNeural'>");
    expect(ssml).toContain("Hello there.");
    expect(ssml).toContain("</voice></speak>");
  });

  it("escapes XML special characters in the script text", () => {
    const ssml = buildSsml(`Tom & Jerry said "hi" <script>`, "Voice", "en-US");
    expect(ssml).toContain("Tom &amp; Jerry said &quot;hi&quot; &lt;script&gt;");
    expect(ssml).not.toContain("<script>");
  });

  it("escapes the voice and language attributes too", () => {
    const ssml = buildSsml("Hi.", "x' injected='1", "en-US");
    expect(ssml).toContain("name='x&apos; injected=&apos;1'");
  });
});
