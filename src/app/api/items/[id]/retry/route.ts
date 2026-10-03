import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractItem } from "@/lib/extract";

// Re-attempts extraction for an item stuck in needs_pdf/failed — e.g. a
// site that was temporarily down, or a paywall that's since been removed.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  let update;
  try {
    update = await extractItem(item);
  } catch (e) {
    update = {
      status: "failed" as const,
      failureReason: e instanceof Error ? e.message : String(e),
    };
  }

  const updated = await prisma.item.update({ where: { id }, data: update });
  return NextResponse.json({ item: updated });
}
