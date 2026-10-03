# Scheduling

## Nightly generation

A single in-process scheduler (`src/instrumentation.ts`, using
[`node-cron`](https://www.npmjs.com/package/node-cron)) drives both the
daily episode and the weekly deep dive — no OS-level cron needed, and it
runs the same way regardless of what's hosting the container.

Settings (editable on `/settings`, under **Scheduling**):

| Setting | Default | Restart required? |
|---|---|---|
| `ENABLE_SCHEDULER` | — (must be set to `true` to run at all; the Docker image sets this directly in `docker-compose.yml`) | Yes — registered once at server startup |
| `NIGHTLY_CRON` | `0 21 * * *` (9pm, local time) | Yes |
| `EPISODE_RETENTION_DAYS` | `15` (0 disables) | No — takes effect immediately |

No explicit timezone is used anywhere — the schedule tracks whatever
timezone the container/host's system clock is set to (`TZ` in
`docker-compose.yml`), matching the app's whole design: "local time,
wherever the machine physically is." The daily episode's cutoff for
"today's content" is a rolling midnight-to-midnight local day, not UTC.

Manual trigger, any time: the "Generate tonight's episode now" button on
the home page, or `POST /api/episodes/generate`.

## The Saturday deep dive

Every time the nightly schedule fires, it also checks whether today
(local time) is a Saturday — if so, it runs a second, separate
generation pass afterward, sequentially (not concurrently; both share one
generation lock, so a concurrent weekly run would just report "already
in progress" and silently skip). There's no separate cron expression for
this — it reuses `NIGHTLY_CRON`'s time-of-day, just with an added
day-of-week check.

What it does differently from the daily episode:

- **Content**: every currently-**starred** item, not "today's new
  content." No date-range filter on top of that — starring is already an
  explicit curation signal, so whatever's starred when Saturday's run
  fires is the set, regardless of when each item was originally added.
- **Length**: a 90-minute budget instead of 45.
- **Tone**: the script prompt is framed as a deep dive — going further
  into fewer items (more context, connections, implications) rather than
  a quick digest. See [prompts.md](./prompts.md) to customize this
  further.
- **After it runs**: every item that went into the deep dive gets
  **unstarred automatically**, so the same item doesn't resurface the
  following Saturday. (A starred item might already belong to a past
  daily episode — unstarring, rather than trying to also attach it to
  the weekly episode's own item list, avoids a data-model conflict:
  `Item.episodeId` is a single foreign key, so "attaching" it to a second
  episode would silently detach it from the first.)

Manual trigger, any time: the "Generate deep dive now" button on the home
page, or `POST /api/episodes/generate` with body `{"type":"weekly"}`.

You can see what's currently queued for the next deep dive at a glance —
a "Starred for this week's deep dive" section appears on the home page
whenever at least one item is starred, with the same ★ toggle to remove
anything you've changed your mind about.

## Episode cleanup

`EPISODE_RETENTION_DAYS` deletes episodes (DB row + audio file) older
than the configured window, every time *any* generation runs — nightly,
weekly, or manual. There's no separate cleanup schedule to maintain;
running the check slightly more often than strictly necessary is
harmless. Set to `0` to disable entirely.
