import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { extractPdfText } from "@/lib/extract-pdf";

const PDF_DIR = path.join(process.cwd(), "data", "pdfs");

// Matches experimental.proxyClientMaxBodySize in next.config.ts — the
// proxy truncates anything larger before it ever reaches this handler.
const MAX_PDF_BYTES = 50 * 1024 * 1024;

// The manual fallback for items stuck at needs_pdf: the user prints the
// inaccessible page to PDF (Cmd+P → Save as PDF) and uploads it here.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const contentLength = Number(req.headers.get("content-length"));
  if (contentLength > MAX_PDF_BYTES) {
    return NextResponse.json({ error: "PDF is too large (max 50MB)" }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart form upload" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "\"file\" is required" }, { status: 400 });
  }
  if (file.type && file.type !== "application/pdf") {
    return NextResponse.json({ error: "Only PDF files are accepted" }, { status: 400 });
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: "PDF is too large (max 50MB)" }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await extractPdfText(buffer);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 422 });
  }

  await mkdir(PDF_DIR, { recursive: true });
  const pdfPath = path.join(PDF_DIR, `${id}.pdf`);
  await writeFile(pdfPath, buffer);

  const updated = await prisma.item.update({
    where: { id },
    data: {
      status: "extracted",
      rawText: result.text,
      pdfPath,
      failureReason: null,
    },
  });

  return NextResponse.json({ item: updated });
}
