import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { InvalidUrlError, normalizeUrl } from "@/lib/url";
import { extractItem } from "@/lib/extract";

export async function GET() {
  const items = await prisma.item.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }

  const url = (body as { url?: unknown })?.url;
  if (typeof url !== "string") {
    return NextResponse.json({ error: "\"url\" is required" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = normalizeUrl(url);
  } catch (e) {
    if (e instanceof InvalidUrlError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  const existing = await prisma.item.findUnique({
    where: { url: parsed.normalized },
  });
  if (existing) {
    return NextResponse.json(
      { error: "This link (or an equivalent one) was already added", item: existing },
      { status: 409 },
    );
  }

  // The findUnique check above is a fast path for the common case, not a
  // guarantee — two near-simultaneous submissions of the same URL (e.g.
  // the extension and the web form both firing) can both pass it, so the
  // actual dedup guarantee is the unique constraint on `url`, handled here.
  let item;
  try {
    item = await prisma.item.create({
      data: {
        url: parsed.normalized,
        rawUrl: parsed.raw,
        type: parsed.type,
        status: "pending",
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const raceLoser = await prisma.item.findUnique({ where: { url: parsed.normalized } });
      return NextResponse.json(
        { error: "This link (or an equivalent one) was already added", item: raceLoser },
        { status: 409 },
      );
    }
    throw e;
  }

  // Extraction runs inline rather than via a background queue: this is a
  // solo local tool, requests to fetch one article/transcript are fast
  // enough (seconds) that a queue would be pure complexity for no benefit.
  // Revisit if/when this needs to survive the request being interrupted.
  let update;
  try {
    update = await extractItem(item);
  } catch (e) {
    update = {
      status: "failed" as const,
      failureReason: e instanceof Error ? e.message : String(e),
    };
  }

  const updated = await prisma.item.update({
    where: { id: item.id },
    data: update,
  });

  return NextResponse.json({ item: updated }, { status: 201 });
}
