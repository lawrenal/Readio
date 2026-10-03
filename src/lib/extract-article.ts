import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

export type ArticleExtractionResult =
  | { ok: true; title: string; text: string }
  | { ok: false; reason: string };

const FETCH_TIMEOUT_MS = 15_000;
const MIN_TEXT_LENGTH = 200; // shorter than this and it's probably a paywall/consent wall, not the article
// Far beyond any real article page — a cap so a hostile or misbehaving
// server can't stream an unbounded body into memory (and then into JSDOM).
const MAX_HTML_BYTES = 10 * 1024 * 1024;

class ResponseTooLargeError extends Error {}

async function readTextCapped(res: Response, maxBytes: number): Promise<string> {
  if (Number(res.headers.get("content-length")) > maxBytes) {
    throw new ResponseTooLargeError();
  }
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ResponseTooLargeError();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// A realistic browser UA — plenty of sites 403 obvious bot/fetch traffic.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export async function extractArticle(url: string): Promise<ArticleExtractionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let html: string;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      return { ok: false, reason: `Fetch failed with status ${res.status}` };
    }
    // Only reject when the server actually claims a non-HTML type — a
    // missing/empty header isn't a signal either way, and rejecting it
    // outright wrongly flagged otherwise-valid HTML from minimally
    // configured servers.
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !contentType.includes("html") && !contentType.includes("xml")) {
      return { ok: false, reason: `Unsupported content-type: ${contentType}` };
    }
    html = await readTextCapped(res, MAX_HTML_BYTES);
  } catch (e) {
    if (e instanceof ResponseTooLargeError) {
      return { ok: false, reason: `Page is larger than ${MAX_HTML_BYTES / 1024 / 1024}MB` };
    }
    const message = e instanceof Error ? e.message : String(e);
    const reason = message.includes("abort") ? "Request timed out" : message;
    return { ok: false, reason };
  } finally {
    clearTimeout(timeout);
  }

  let dom: JSDOM;
  try {
    dom = new JSDOM(html, { url });
  } catch (e) {
    return { ok: false, reason: `Failed to parse HTML: ${e instanceof Error ? e.message : String(e)}` };
  }

  const parsed = new Readability(dom.window.document).parse();
  if (!parsed || !parsed.textContent || parsed.textContent.trim().length < MIN_TEXT_LENGTH) {
    return { ok: false, reason: "Couldn't find enough article content (likely paywalled or JS-rendered)" };
  }

  return {
    ok: true,
    title: parsed.title || url,
    text: parsed.textContent.trim(),
  };
}
