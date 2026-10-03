// Normalizes a submitted URL for storage/dedup, and classifies it as an
// article or a YouTube video (the only two item types V1 handles).

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "fbclid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "ref",
  "ref_src",
  "si", // YouTube's share-link tracking param
]);

const YOUTUBE_HOSTS = new Set(["youtube.com", "youtu.be", "m.youtube.com"]);

export class InvalidUrlError extends Error {}

export type NormalizedUrl = {
  /** Canonical form used for storage + dedup. */
  normalized: string;
  /** A fetchable absolute URL, as close to what the user submitted as possible. */
  raw: string;
  type: "article" | "youtube";
};

export function normalizeUrl(input: string): NormalizedUrl {
  const trimmed = input.trim();
  if (!trimmed) throw new InvalidUrlError("URL is required");

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new InvalidUrlError(`"${input}" is not a valid URL`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new InvalidUrlError("Only http/https URLs are supported");
  }
  if (!parsed.hostname.includes(".")) {
    throw new InvalidUrlError(`"${input}" doesn't look like a valid URL`);
  }
  const raw = parsed.toString();

  let hostname = parsed.hostname.toLowerCase();
  if (hostname.startsWith("www.")) hostname = hostname.slice(4);

  const type: NormalizedUrl["type"] = YOUTUBE_HOSTS.has(hostname)
    ? "youtube"
    : "article";

  const params = new URLSearchParams(parsed.search);
  for (const key of [...params.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) params.delete(key);
  }
  params.sort();
  const search = params.toString();

  let pathname = parsed.pathname;
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }

  const normalized = `${hostname}${pathname}${search ? `?${search}` : ""}`;

  return { normalized, raw, type };
}
