const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// The browser extension posts to /api/items from its own origin — a
// legitimate cross-origin caller. (An installed extension with host
// permissions could reach this app regardless, so allowing it opens
// nothing new.)
const EXTENSION_ORIGIN = /^(chrome|moz|safari-web)-extension:\/\//;

/**
 * Blocks cross-site state-changing requests (CSRF). Without this, any web
 * page you visit could POST to this app — the route handlers parse JSON
 * regardless of Content-Type, so a "simple" text/plain or multipart form
 * request needs no CORS preflight — and add links to your feed, trigger
 * (paid) generation runs, or make the server fetch internal-network URLs.
 * Browsers also attach cached Basic Auth credentials to such requests, so
 * the password gate alone doesn't stop it. Non-browser callers (curl, the
 * nightly script) send neither header and are unaffected.
 */
export function isCrossSiteWrite(request: Pick<Request, "method" | "headers">): boolean {
  if (SAFE_METHODS.has(request.method)) return false;

  const origin = request.headers.get("origin");
  if (origin && EXTENSION_ORIGIN.test(origin)) return false;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite) return fetchSite === "cross-site" || fetchSite === "same-site";

  // Older browsers without Fetch Metadata: fall back to comparing Origin
  // against the host the request was addressed to.
  if (!origin) return false; // not a browser cross-origin request
  if (origin === "null") return true; // opaque origin (sandboxed iframe, data: URL)
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}
