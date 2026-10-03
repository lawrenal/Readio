import { NextRequest, NextResponse } from "next/server";
import { buildDailyEpisode, buildWeeklyEpisode } from "@/lib/episode";
import { getGenerationStatus, estimatePercent, STEP_LABELS } from "@/lib/generation-status";

// Polled by the UI (GenerateEpisodeButton) so progress survives
// navigating away and back — the client re-checks this on every mount
// instead of relying on local state that resets when the component
// unmounts. Safe to poll from anywhere; this is just a read of
// in-memory server state, not tied to who triggered the generation.
export async function GET() {
  const status = getGenerationStatus();
  return NextResponse.json({
    running: status.running,
    step: status.step,
    stepLabel: STEP_LABELS[status.step],
    detail: status.detail ?? null,
    percent: estimatePercent(status),
    startedAt: status.startedAt ?? null,
  });
}

// Hit by the nightly launchd job (see scripts/nightly.sh). Also callable
// by hand for testing: POST /api/episodes/generate {"date": "2026-09-27"}
// or {"type": "weekly"} for the starred-items deep dive.
export async function POST(req: NextRequest) {
  let date = new Date();
  let type: "daily" | "weekly" = "daily";
  let body: { date?: unknown; type?: unknown } | null = null;
  try {
    body = await req.json();
  } catch {
    // no body / not JSON — generate for today, that's fine
  }
  if (body?.date !== undefined) {
    // A bare "YYYY-MM-DD" parses as UTC midnight, which lands on the
    // previous local day anywhere west of UTC — parse it as a local date.
    const ymd = typeof body.date === "string" ? body.date.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
    date = ymd
      ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
      : new Date(body.date as string);
    if (typeof body.date !== "string" || Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: "\"date\" must be a valid date string, e.g. 2026-09-27" }, { status: 400 });
    }
  }
  if (body?.type === "weekly") type = "weekly";

  try {
    const result = type === "weekly" ? await buildWeeklyEpisode(date) : await buildDailyEpisode(date);
    if (result.skipped) {
      return NextResponse.json({ skipped: true, reason: result.reason });
    }
    return NextResponse.json({ skipped: false, episode: result.episode });
  } catch (e) {
    console.error("[api/episodes/generate] failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
