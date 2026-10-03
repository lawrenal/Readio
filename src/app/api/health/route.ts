import { NextResponse } from "next/server";

// Dedicated, deliberately unauthenticated health check for Docker's
// healthcheck (and anything else probing liveness) — kept separate from
// /api/items so the basic-auth gate (src/proxy.ts) can exempt this one
// specific route without exempting a real data endpoint. Returns no
// data, just confirms the Next.js server is up and responding.
export async function GET() {
  return NextResponse.json({ ok: true });
}
