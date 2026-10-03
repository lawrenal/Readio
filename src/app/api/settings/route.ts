import { NextRequest, NextResponse } from "next/server";
import { getAllSettingStatuses, setSetting, SETTINGS } from "@/lib/settings";

export async function GET() {
  const settings = await getAllSettingStatuses();
  return NextResponse.json({ settings });
}

const VALID_KEYS = new Set(SETTINGS.map((s) => s.key));

// Body: { updates: { key: string, value: string }[] }. Accepts a batch so
// the settings page can save everything changed on the form in one call.
// Rejects unknown keys rather than silently accepting them — this isn't
// meant to be an arbitrary key/value store.
export async function PATCH(req: NextRequest) {
  let body: { updates?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates = body?.updates ?? [];
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: "Expected a non-empty \"updates\" array" }, { status: 400 });
  }

  // Validate the whole batch before writing any of it, so a bad entry
  // can't leave the batch half-applied.
  for (const update of updates as unknown[]) {
    const { key, value } = (update ?? {}) as { key?: unknown; value?: unknown };
    if (typeof key !== "string" || !VALID_KEYS.has(key)) {
      return NextResponse.json({ error: `Unknown setting "${String(key)}"` }, { status: 400 });
    }
    if (value !== undefined && value !== null && typeof value !== "string") {
      return NextResponse.json({ error: `Value for "${key}" must be a string` }, { status: 400 });
    }
  }

  try {
    for (const { key, value } of updates as Array<{ key: string; value?: string | null }>) {
      await setSetting(key, value ?? "");
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  const settings = await getAllSettingStatuses();
  return NextResponse.json({ settings });
}
