import { NextRequest, NextResponse } from "next/server";
import { rm } from "node:fs/promises";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const episode = await prisma.episode.findUnique({ where: { id } });
  if (!episode) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  // Best-effort — an already-missing file (manually cleaned up, or a
  // leftover from testing) shouldn't block deleting the DB record.
  await rm(episode.audioPath, { force: true }).catch((e) =>
    console.error(`[api/episodes] Couldn't remove audio file for ${id} (${episode.audioPath}):`, e),
  );
  await prisma.episode.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
