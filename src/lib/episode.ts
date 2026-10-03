import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "./prisma";
import { isAiConfigured, summarizeEpisode, summarizeItem, type ScriptSourceItem } from "./ai";
import { generateScript } from "./episode-script";
import { getTtsProvider } from "./tts";
import { getSetting } from "./settings";
import { localDateKey } from "./group-by-day";
import { startGeneration, setGenerationStep, setGenerationStepProgress, endGeneration } from "./generation-status";
import type { Episode, Item } from "@/generated/prisma/client";

const DEFAULT_RETENTION_DAYS = 15;

/**
 * Deletes episodes (DB row + audio file) older than the configured
 * retention window. Runs at the start of every generation attempt
 * (nightly cron or a manual "generate now" click) rather than its own
 * separate schedule — simplest way to guarantee it actually runs
 * regularly without a second cron job to maintain, and running it more
 * often than strictly necessary is harmless. Deleting an Episode row
 * sets any attached Item.episodeId back to null (ON DELETE SET NULL,
 * see the migration) — safe to leave that way: buildDailyEpisode only
 * ever looks at items created *today*, so an old item becoming
 * "unattached" again can't cause it to resurface in a future episode.
 */
async function cleanupOldEpisodes(): Promise<void> {
  const raw = await getSetting("EPISODE_RETENTION_DAYS");
  const retentionDays = raw ? parseInt(raw, 10) : DEFAULT_RETENTION_DAYS;
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return; // 0/invalid = disabled

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const stale = await prisma.episode.findMany({ where: { createdAt: { lt: cutoff } } });
  for (const ep of stale) {
    await rm(ep.audioPath, { force: true }).catch((e) =>
      console.error(`[episode] Couldn't remove audio file for ${ep.id} (${ep.audioPath}):`, e),
    );
    await prisma.episode.delete({ where: { id: ep.id } });
  }
  if (stale.length > 0) {
    console.log(`[episode] Auto-deleted ${stale.length} episode(s) older than ${retentionDays} days`);
  }
}

const MAX_DAILY_MINUTES = 45;

// The weekly deep-dive gets a much bigger time budget than daily — it's
// meant to be an occasional, thorough listen through a week's worth of
// hand-picked (starred) items, not a quick digest. See README.md.
const MAX_WEEKLY_MINUTES = 90;

function localDayWindow(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export type BuildEpisodeResult =
  | { skipped: true; reason: string }
  | { skipped: false; episode: Episode };

// Guards against two overlapping generation runs (the nightly cron firing
// at the same moment as a manual "generate now" click, a double-click on
// that button, or a retried request) each grabbing the same not-yet-
// attached items and writing separate Episode rows for the same day.
// Found for real during testing: 3 overlapping requests produced 3
// episodes from one item. A single in-memory flag is sufficient here —
// this runs as one Node process per container, no multi-instance
// deployment to coordinate across. Shared between daily and weekly
// generation (not one flag each) since both write to the same audio
// directory and drive the same single-slot generation-status UI — only
// one of either kind should ever run at a time.
let generationInProgress = false;

async function withGenerationLock(run: () => Promise<BuildEpisodeResult>): Promise<BuildEpisodeResult> {
  if (generationInProgress) {
    return { skipped: true, reason: "Episode generation is already in progress" };
  }
  generationInProgress = true;
  startGeneration();
  try {
    return await run();
  } finally {
    generationInProgress = false;
    endGeneration();
  }
}

/**
 * Builds and voices tonight's episode from today's extracted items (local
 * calendar day). No-ops if there's nothing new. Items already attached to
 * an episode are excluded, so this is safe to re-run.
 */
export async function buildDailyEpisode(forDate: Date = new Date()): Promise<BuildEpisodeResult> {
  return withGenerationLock(() => runBuildDailyEpisode(forDate));
}

async function runBuildDailyEpisode(forDate: Date): Promise<BuildEpisodeResult> {
  // startGeneration() already set the step to "cleaning_up" before this runs.
  await cleanupOldEpisodes();

  setGenerationStep("checking_items");
  const { start, end } = localDayWindow(forDate);

  const items = await prisma.item.findMany({
    where: {
      status: "extracted",
      episodeId: null,
      createdAt: { gte: start, lt: end },
    },
    orderBy: { createdAt: "asc" },
  });

  if (items.length === 0) {
    return { skipped: true, reason: "No new content for this day" };
  }

  return generateEpisodeFromItems({
    items,
    maxMinutes: MAX_DAILY_MINUTES,
    kind: "daily",
    date: start,
    filenamePrefix: "daily",
    // Daily items get attached to their episode via the normal relation
    // — see generateEpisodeFromItems's linkItems doc comment for why
    // weekly doesn't do the same.
    linkItems: true,
  });
}

/**
 * Builds and voices this week's deep-dive episode from currently-starred
 * items — no date-range filter on top of that, since starring is already
 * an explicit curation signal (see ItemRow's "Star for the weekly
 * deep-dive" toggle); whatever's starred right now is the week's set.
 * No-ops if nothing is starred. Meant to run alongside (not instead of)
 * the daily episode on whatever day you schedule it — see
 * instrumentation.ts.
 */
export async function buildWeeklyEpisode(forDate: Date = new Date()): Promise<BuildEpisodeResult> {
  return withGenerationLock(() => runBuildWeeklyEpisode(forDate));
}

async function runBuildWeeklyEpisode(forDate: Date): Promise<BuildEpisodeResult> {
  await cleanupOldEpisodes();

  setGenerationStep("checking_items");
  const { start } = localDayWindow(forDate);

  const items = await prisma.item.findMany({
    where: { status: "extracted", starred: true },
    orderBy: { createdAt: "asc" },
  });

  if (items.length === 0) {
    return { skipped: true, reason: "No starred items for the weekly deep dive" };
  }

  const result = await generateEpisodeFromItems({
    items,
    maxMinutes: MAX_WEEKLY_MINUTES,
    kind: "weekly",
    date: start,
    filenamePrefix: "weekly",
    // A starred item may already belong to a past daily episode —
    // Item.episodeId is a single FK, so connecting it here would silently
    // reassign it away from that episode. Instead, mark these as "covered"
    // by just unstarring them below once the episode exists (same
    // "consumed" meaning as episodeId being set for daily items), without
    // touching their original daily attachment at all.
    linkItems: false,
  });

  if (!result.skipped) {
    await prisma.item.updateMany({
      where: { id: { in: items.map((i) => i.id) } },
      data: { starred: false },
    });
  }

  return result;
}

async function generateEpisodeFromItems(params: {
  items: Item[];
  maxMinutes: number;
  kind: "daily" | "weekly";
  date: Date;
  filenamePrefix: string;
  linkItems: boolean;
}): Promise<BuildEpisodeResult> {
  const { items, maxMinutes, kind, date, filenamePrefix, linkItems } = params;

  const aiConfigured = await isAiConfigured();

  // Make sure every item has a summary before scripting — the template
  // fallback doesn't need one (it reads raw text back directly), so skip
  // this entirely when no AI key is configured rather than fail loudly.
  const summaries = new Map<string, { summary: string; keyFacts: string[] }>();
  if (aiConfigured) {
    setGenerationStep("summarizing_items", `0 of ${items.length} items`);
    let completed = 0;
    // Each item's summarization is independent, so run them concurrently
    // rather than one at a time — otherwise nightly generation latency
    // scales linearly with item count for no correctness benefit. Each
    // iteration writes to its own key in `summaries`, so there's no race
    // — same goes for the `completed` counter below, since each
    // increment happens synchronously within its own callback, never
    // interleaved with another one mid-read-modify-write.
    await Promise.all(
      items.map(async (item) => {
        try {
          if (item.summary) {
            summaries.set(item.id, {
              summary: item.summary,
              keyFacts: item.keyFacts ? JSON.parse(item.keyFacts) : [],
            });
            return;
          }
          const text = item.rawText ?? item.transcript ?? "";
          const result = await summarizeItem({ title: item.title ?? item.rawUrl, text });
          await prisma.item.update({
            where: { id: item.id },
            data: {
              summary: result.summary,
              keyFacts: JSON.stringify(result.keyFacts),
              tags: JSON.stringify(result.tags),
            },
          });
          summaries.set(item.id, { summary: result.summary, keyFacts: result.keyFacts });
        } catch (e) {
          console.error(`[episode] Summarization failed for item ${item.id}:`, e);
        } finally {
          completed += 1;
          setGenerationStepProgress(`${completed} of ${items.length} items`, completed / items.length);
        }
      }),
    );
  }

  setGenerationStep("writing_script");

  const sourceItems: ScriptSourceItem[] = items.map((item) => ({
    id: item.id,
    title: item.title ?? item.rawUrl,
    type: item.type,
    summary: summaries.get(item.id)?.summary ?? "",
    keyFacts: summaries.get(item.id)?.keyFacts ?? [],
    text: item.rawText ?? item.transcript ?? "",
  }));

  const scriptResult = await generateScript(sourceItems, maxMinutes, kind);

  const audioDir = path.join(process.cwd(), "data", "audio");
  await mkdir(audioDir, { recursive: true });
  const dateStr = localDateKey(date);
  const tts = await getTtsProvider();
  const audioPath = path.join(audioDir, `${filenamePrefix}-${dateStr}-${Date.now()}.${tts.fileExtension}`);

  setGenerationStep("synthesizing_audio");
  // Run concurrently with TTS synthesis (which can take many minutes) —
  // the teaser summary is a quick, independent call, no reason to make
  // it add to the wall-clock time. A failure here shouldn't break episode
  // creation at all, just leave the summary blank (see the catch below).
  const [{ durationSec }, summary] = await Promise.all([
    tts.synthesize(scriptResult.text, audioPath),
    aiConfigured
      ? summarizeEpisode(scriptResult.text).catch((e) => {
          console.error("[episode] Episode summary generation failed:", e);
          return null;
        })
      : Promise.resolve(null),
  ]);

  const maxSec = maxMinutes * 60;
  const notes = [
    scriptResult.note,
    durationSec > maxSec
      ? `Ran long: ${Math.round(durationSec / 60)}min vs the ${maxMinutes}min target (not hard-cut, audio is never truncated mid-sentence).`
      : null,
  ]
    .filter(Boolean)
    .join(" ") || null;

  const episode = await prisma.episode.create({
    data: {
      date,
      type: kind,
      script: scriptResult.text,
      summary,
      audioPath,
      durationSec,
      notes,
      ...(linkItems ? { items: { connect: items.map((i) => ({ id: i.id })) } } : {}),
    },
  });

  return { skipped: false, episode };
}
