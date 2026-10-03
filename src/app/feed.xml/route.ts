import { NextRequest, NextResponse } from "next/server";
import { stat } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { buildRssFeed } from "@/lib/rss";

export async function GET(req: NextRequest) {
  const episodes = await prisma.episode.findMany({ orderBy: { date: "desc" } });

  const withSizes = await Promise.all(
    episodes.map(async (ep) => {
      try {
        const s = await stat(ep.audioPath);
        return { ...ep, sizeBytes: s.size };
      } catch {
        return { ...ep, sizeBytes: 0 }; // audio file missing on disk — feed still lists it
      }
    }),
  );

  const origin = new URL(req.url).origin;
  const xml = buildRssFeed(withSizes, origin);

  return new NextResponse(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
