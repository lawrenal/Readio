import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const episodes = await prisma.episode.findMany({
    orderBy: { date: "desc" },
    include: { items: { select: { id: true, title: true, rawUrl: true } } },
  });
  return NextResponse.json({ episodes });
}
