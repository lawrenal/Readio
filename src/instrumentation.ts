// Next.js's documented hook for server-startup side effects — register()
// runs once when the server process boots. Used here to replace the
// macOS-only launchd nightly trigger with an in-process scheduler, so the
// same container works the same way regardless of what's hosting it
// (a home-lab Docker box, this Mac, wherever). See launchd/README.md for
// why the mac-native path still exists too (that branch: `macos-native`).
//
// Deliberately opt-in via ENABLE_SCHEDULER=true, not automatic:
// - Local `next dev` already runs this module on every hot reload, which
//   would re-register the cron job repeatedly.
// - The macOS-native setup already has launchd for this; running both
//   would generate two episodes a night.
// The Docker deployment's docker-compose.yml sets ENABLE_SCHEDULER=true
// explicitly — this is the one place that actually wants it.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.ENABLE_SCHEDULER !== "true") return;

  const cron = await import("node-cron");
  const { buildDailyEpisode, buildWeeklyEpisode } = await import("./lib/episode");

  // No explicit timezone — this app's whole design is "local time,
  // wherever the machine physically is," so the schedule should track
  // the container/host's system clock, not a hardcoded IANA zone.
  const schedule = process.env.NIGHTLY_CRON || "0 21 * * *"; // 9pm local, matches the original launchd time

  cron.schedule(schedule, async () => {
    console.log(`[scheduler] Running nightly episode generation (${new Date().toISOString()})`);
    try {
      const result = await buildDailyEpisode();
      if (result.skipped) {
        console.log(`[scheduler] Skipped: ${result.reason}`);
      } else {
        console.log(`[scheduler] Generated episode ${result.episode.id}`);
      }
    } catch (e) {
      // A failed nightly run shouldn't crash the server — log it and
      // wait for the next scheduled attempt (or a manual trigger via
      // the "Generate tonight's episode now" button).
      console.error("[scheduler] Nightly episode generation failed:", e);
    }

    // Deliberately sequential, not Promise.all'd with the daily build
    // above — both share the same single-slot generation lock
    // (episode.ts), so firing them concurrently would just make this one
    // silently skip with "already in progress." Saturday, not a
    // configurable day/cron, to keep this simple for now: one knob
    // (NIGHTLY_CRON) controls time-of-day for both, this just picks which
    // day of the week also gets the deep dive.
    if (new Date().getDay() === 6) {
      console.log(`[scheduler] Running weekly deep-dive generation (${new Date().toISOString()})`);
      try {
        const result = await buildWeeklyEpisode();
        if (result.skipped) {
          console.log(`[scheduler] Weekly deep dive skipped: ${result.reason}`);
        } else {
          console.log(`[scheduler] Generated weekly deep-dive episode ${result.episode.id}`);
        }
      } catch (e) {
        console.error("[scheduler] Weekly deep-dive generation failed:", e);
      }
    }
  });

  console.log(`[scheduler] Nightly episode generation scheduled: "${schedule}" (local time, weekly deep dive also runs Saturdays)`);
}
