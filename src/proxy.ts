import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSetting } from "@/lib/settings";
import { isCrossSiteWrite } from "@/lib/csrf";

// Hashing first makes both inputs the same length, which timingSafeEqual
// requires, without leaking the real length through an early return.
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// Optional, off-by-default password gate for the whole app — see
// docs/security.md. There's no real login/session system in this app at
// all (it's a single-user, local-config tool), so if you expose it
// beyond your own LAN/VPN without something else handling auth in front
// of it (a Cloudflare Tunnel with its own access policy, a reverse proxy
// with its own auth, etc.), turn BASIC_AUTH_ENABLED on in /settings.
//
// Named `proxy.ts`, not `middleware.ts` — Next.js 16 renamed the file
// convention (and it now defaults to the Node.js runtime, not Edge),
// which is exactly why this can call getSetting() directly instead of
// needing some Edge-compatible workaround.
export async function proxy(request: NextRequest) {
  if (isCrossSiteWrite(request)) {
    return new Response("Cross-site request rejected.", { status: 403 });
  }

  const enabled = (await getSetting("BASIC_AUTH_ENABLED")) === "true";
  if (!enabled) return NextResponse.next();

  const username = await getSetting("BASIC_AUTH_USERNAME");
  const password = await getSetting("BASIC_AUTH_PASSWORD");

  const authHeader = request.headers.get("authorization");
  if (username && password && authHeader?.startsWith("Basic ")) {
    const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex !== -1) {
      const providedUser = decoded.slice(0, separatorIndex);
      const providedPass = decoded.slice(separatorIndex + 1);
      // Both compared unconditionally (not &&) so a wrong username
      // doesn't return measurably faster than a wrong password.
      const userOk = safeEqual(providedUser, username);
      const passOk = safeEqual(providedPass, password);
      if (userOk && passOk) {
        return NextResponse.next();
      }
    }
  }

  // Fails closed — including when enabled but username/password haven't
  // actually been set yet, rather than silently letting everyone through
  // because the admin only got halfway through configuring it. If you
  // lock yourself out, disable BASIC_AUTH_ENABLED directly in the
  // database (see docs/security.md for the exact command).
  return new Response("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Readio"' },
  });
}

export const config = {
  // Everything except: Next's own static/image-optimization internals,
  // the favicon/app-icon files (so a browser's automatic favicon request
  // doesn't trigger a spurious auth prompt before the page itself even
  // loads), and the dedicated unauthenticated health check Docker polls.
  // `$` anchors so the exemptions can't be prefix-matched by other paths
  // (e.g. a future /api/healthcheck-admin route silently skipping auth).
  matcher: ["/((?!_next/static|_next/image|favicon.ico$|icon.png$|apple-icon.png$|api/health$).*)"],
};
