import type { Item } from "@/generated/prisma/client";
import { extractArticle } from "./extract-article";
import { extractYoutubeTranscript } from "./extract-youtube";

// Successful variants explicitly null out failureReason — a retry that
// succeeds must clear the error left by the attempt before it.
export type ExtractionUpdate =
  | { status: "extracted"; rawText: string; title: string; failureReason: null }
  | { status: "extracted"; transcript: string; title: string | null; failureReason: null }
  | { status: "needs_pdf"; failureReason: string }
  | { status: "failed"; failureReason: string };

/**
 * Attempts extraction for an item and returns the fields to persist.
 * Articles that fail become `needs_pdf` (there's a manual fallback for
 * those). YouTube videos with no transcript just fail — no fallback in V1.
 */
export async function extractItem(item: Pick<Item, "type" | "rawUrl">): Promise<ExtractionUpdate> {
  if (item.type === "youtube") {
    const result = await extractYoutubeTranscript(item.rawUrl);
    if (result.ok) {
      return { status: "extracted", transcript: result.text, title: result.title, failureReason: null };
    }
    return { status: "failed", failureReason: result.reason };
  }

  const result = await extractArticle(item.rawUrl);
  if (result.ok) {
    return { status: "extracted", rawText: result.text, title: result.title, failureReason: null };
  }
  return { status: "needs_pdf", failureReason: result.reason };
}
