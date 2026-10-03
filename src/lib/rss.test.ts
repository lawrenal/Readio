import { describe, expect, it } from "vitest";
import { buildRssFeed } from "./rss";
import type { Episode } from "@/generated/prisma/client";

function makeEpisode(overrides: Partial<Episode> = {}): Episode & { sizeBytes: number } {
  return {
    id: "ep1",
    date: new Date("2026-09-27T00:00:00.000Z"),
    type: "daily",
    script: "Hello & welcome.",
    audioPath: "/tmp/ep1.m4a",
    durationSec: 120,
    notes: null,
    summary: null,
    createdAt: new Date("2026-09-27T21:00:00.000Z"),
    sizeBytes: 4096,
    ...overrides,
  };
}

describe("buildRssFeed", () => {
  it("includes required RSS/podcast fields", () => {
    const xml = buildRssFeed([makeEpisode()], "http://localhost:3000");
    expect(xml).toContain("<rss version=\"2.0\"");
    expect(xml).toContain("<title>Readio</title>");
    expect(xml).toContain("<guid isPermaLink=\"false\">ep1</guid>");
    expect(xml).toContain('<enclosure url="http://localhost:3000/audio/ep1" type="audio/mp4" length="4096" />');
    expect(xml).toContain("<itunes:duration>120</itunes:duration>");
  });

  it("labels daily vs weekly episodes distinctly", () => {
    const daily = buildRssFeed([makeEpisode({ type: "daily" })], "http://x");
    const weekly = buildRssFeed([makeEpisode({ type: "weekly" })], "http://x");
    expect(daily).toContain("Daily Digest");
    expect(weekly).toContain("Weekly Deep Dive");
  });

  it("escapes XML special characters in notes", () => {
    const xml = buildRssFeed(
      [makeEpisode({ notes: "AI & <script> said \"hi\"" })],
      "http://x",
    );
    expect(xml).toContain("AI &amp; &lt;script&gt; said &quot;hi&quot;");
    expect(xml).not.toContain("<script>");
  });

  it("uses the episode summary as the description when there are no notes", () => {
    const xml = buildRssFeed(
      [makeEpisode({ summary: "Covers two articles about espresso machines." })],
      "http://x",
    );
    expect(xml).toContain("<description>Covers two articles about espresso machines.</description>");
  });

  it("prefers notes over summary when both are present (notes are diagnostic)", () => {
    const xml = buildRssFeed(
      [makeEpisode({ notes: "Ran long: 50min vs target", summary: "A summary." })],
      "http://x",
    );
    expect(xml).toContain("<description>Ran long: 50min vs target</description>");
  });

  it("falls back to a generic description when neither notes nor summary exist", () => {
    const xml = buildRssFeed([makeEpisode({ type: "weekly" })], "http://x");
    expect(xml).toContain("<description>Generated from weekly content.</description>");
  });

  it("produces a feed with no items when given an empty list", () => {
    const xml = buildRssFeed([], "http://localhost:3000");
    expect(xml).toContain("<channel>");
    expect(xml).not.toContain("<item>");
  });
});
