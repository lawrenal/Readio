import { PDFParse } from "pdf-parse";

export type PdfExtractionResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

// Used for the manual fallback: the user prints an inaccessible page to PDF
// and uploads it instead of us trying to fetch it.
export async function extractPdfText(data: Buffer): Promise<PdfExtractionResult> {
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    const text = result.text.replace(/\s*--\s*\d+\s+of\s+\d+\s*--\s*/g, "\n").trim();
    if (!text) {
      return { ok: false, reason: "No extractable text found in PDF" };
    }
    return { ok: true, text };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  } finally {
    await parser.destroy();
  }
}
