import { NextRequest, NextResponse } from "next/server";
import { rm } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

function isNotFound(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025";
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }

  const starred = (body as { starred?: unknown })?.starred;
  if (typeof starred !== "boolean") {
    return NextResponse.json({ error: "\"starred\" (boolean) is required" }, { status: 400 });
  }

  try {
    const item = await prisma.item.update({
      where: { id },
      data: { starred },
    });
    return NextResponse.json({ item });
  } catch (e) {
    if (isNotFound(e)) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    throw e;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let item;
  try {
    item = await prisma.item.delete({ where: { id } });
  } catch (e) {
    if (isNotFound(e)) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    throw e;
  }

  // Best-effort, same as episode audio — a missing file shouldn't turn a
  // successful delete into an error.
  if (item.pdfPath) {
    await rm(item.pdfPath, { force: true }).catch((e) =>
      console.error(`[api/items] Couldn't remove PDF for ${id} (${item.pdfPath}):`, e),
    );
  }

  return NextResponse.json({ ok: true });
}
