import type { Episode } from "@/generated/prisma/client";
import { mimeTypeForAudioPath } from "./audio-mime";
import { localDateKey } from "./group-by-day";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function episodeTitle(episode: Episode): string {
  const label = episode.type === "weekly" ? "Weekly Deep Dive" : "Daily Digest";
  // Local calendar day — `date` is stored as local midnight (see
  // localDayWindow in episode.ts), so slicing the UTC ISO string would
  // show the previous day anywhere east of UTC.
  const dateStr = localDateKey(episode.date);
  return `${label} — ${dateStr}`;
}

/**
 * Builds a private podcast RSS feed. `origin` is taken from the incoming
 * request (not a fixed config value) so this works whether you're hitting
 * it via localhost, a LAN IP, or a Tailscale hostname.
 */
export function buildRssFeed(episodes: (Episode & { sizeBytes: number })[], origin: string): string {
  const items = episodes
    .map((ep) => {
      const audioUrl = `${origin}/audio/${ep.id}`;
      return `
    <item>
      <title>${escapeXml(episodeTitle(ep))}</title>
      <guid isPermaLink="false">${ep.id}</guid>
      <pubDate>${ep.createdAt.toUTCString()}</pubDate>
      <enclosure url="${escapeXml(audioUrl)}" type="${mimeTypeForAudioPath(ep.audioPath)}" length="${ep.sizeBytes}" />
      <itunes:duration>${ep.durationSec}</itunes:duration>
      <description>${escapeXml(ep.notes ?? ep.summary ?? `Generated from ${ep.type} content.`)}</description>
    </item>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Readio</title>
    <description>A personal podcast generated from links sent throughout the day.</description>
    <language>en-us</language>
    <itunes:explicit>false</itunes:explicit>
    <itunes:author>Readio</itunes:author>${items}
  </channel>
</rss>`;
}
