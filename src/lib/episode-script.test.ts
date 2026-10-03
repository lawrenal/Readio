import { describe, expect, it, vi } from "vitest";
import { generateScript } from "./episode-script";
import type { ScriptSourceItem } from "./ai";

// getSetting() now hits the database (see src/lib/settings.ts), which
// isn't available in the test environment — stubbed at that boundary so
// ai.ts's real isAiConfigured()/getClient() logic still runs, just
// against "nothing configured," same as a real deployment with no key
// set anywhere. See human-eyes.md re: the real AI path.
vi.mock("./settings", () => ({ getSetting: async () => undefined }));

// No AI provider configured, so this exercises the template fallback
// path — the same path a real deployment falls back to when no provider
// is configured (whichever one AI_PROVIDER points at).
describe("generateScript (template fallback, no API key)", () => {
  const items: ScriptSourceItem[] = [
    { id: "1", title: "First Article", type: "article", summary: "A summary.", keyFacts: [], text: "Full text one." },
    { id: "2", title: "A Video", type: "youtube", summary: "", keyFacts: [], text: "Transcript text here." },
  ];

  it("falls back to the template writer and says why", async () => {
    const result = await generateScript(items, 45);
    expect(result.method).toBe("template");
    // Regression guard: this used to hardcode "ANTHROPIC_API_KEY not
    // set" even when a different provider was selected — generic
    // wording now, so it stays true regardless of AI_PROVIDER.
    expect(result.note).toMatch(/No AI provider configured/);
    expect(result.note).not.toMatch(/ANTHROPIC_API_KEY/);
  });

  it("mentions every item's title in the script", async () => {
    const result = await generateScript(items, 45);
    expect(result.text).toContain("First Article");
    expect(result.text).toContain("A Video");
  });

  it("uses the summary when present, falls back to raw text otherwise", async () => {
    const result = await generateScript(items, 45);
    expect(result.text).toContain("A summary.");
    expect(result.text).toContain("Transcript text here.");
  });
});
