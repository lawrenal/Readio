# Editable prompts

The system prompts for the two LLM calls that shape tone/style —
episode script-writing and the episode teaser summary — are fully
editable from `/settings`, under the **Prompts** section. This works
regardless of which [AI provider](./ai-providers.md) you've selected.

There are three:

- **Daily episode script prompt** — instructions for the nightly script
  that clusters the day's items and writes the narration.
- **Weekly deep-dive script prompt** — same idea, but for Saturday's
  longer episode built from starred items (see [scheduling.md](./scheduling.md)).
- **Episode summary prompt** — instructions for the short teaser summary
  shown next to each episode (in the web UI and the podcast feed's
  description field).

## How editing works

Each textarea is pre-filled with the **real built-in default text**, not
left blank — editing means starting from what it actually does right now
and tweaking it, not writing a prompt from scratch blind.

Saving an edit **fully replaces** the built-in instructions, not just
appends to them — if you want to keep most of the original behavior and
change one thing, copy the existing text first and edit from there rather
than writing something short that assumes the old instructions are still
implicitly in effect.

A **"Reset to default"** button appears once you've saved an override,
which clears it and reverts to the built-in text.

## Placeholders

The two script prompts (daily and weekly) use `{{maxWords}}` and
`{{maxMinutes}}` as literal placeholder tokens in the text — these get
substituted automatically at generation time with the actual numbers for
whichever kind of episode is being generated (45 minutes/~6750 words for
daily, 90 minutes/~13500 words for weekly). Keep these tokens somewhere
in your edited prompt if you still want the model to respect a
length/time target; removing them just means the model has no explicit
guidance on how long to make the episode.

The episode summary prompt has no placeholders — the full generated
script is passed in automatically as the thing to summarize.

## Example: making the weekly deep dive more opinionated

The default weekly prompt already asks for "more context, implications,
and connections between items" rather than a quick summary. If you want
it to go further — say, explicitly offering an opinion or recommendation
on each item rather than staying neutral — you could add a line like:

```
7. Don't just explain each item neutrally — offer a clear take on
   whether it's worth the listener's continued attention, and why.
```

appended to a copy of the existing weekly prompt text, then save.

## Where the defaults actually live

If you want to see the exact current default text without going through
the UI, it's in `src/lib/prompts.ts` — the single source of truth both
the generation code (`src/lib/ai.ts`) and the settings page read from.
