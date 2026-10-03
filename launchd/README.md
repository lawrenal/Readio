# Unattended overnight operation (M4)

Two LaunchAgents:

- **`com.readio.server`** — keeps `npm run dev` running (RunAtLoad +
  KeepAlive), so the capture form/API/RSS feed are always reachable.
- **`com.readio.nightly`** — fires `scripts/nightly.sh` at 9:00 PM
  local time, which POSTs to `/api/episodes/generate`.

Both plists and `install.sh`/`uninstall.sh` are written, plist syntax is
validated (`plutil -lint`), and the load/unload mechanism itself was
tested (loaded `com.readio.nightly`, confirmed via `launchctl list`,
unloaded it again) — nothing is left loaded on this Mac right now.

## Why this isn't installed yet

Deliberately not run automatically:

1. **No `ANTHROPIC_API_KEY` is configured yet** (see human-eyes.md) — a
   real nightly run tonight would silently produce template-fallback
   episodes, not the clustered/narrated ones this is actually for.
2. Installing a LaunchAgent changes this Mac's startup behavior outside
   the git repo — the kind of durable, outward-facing change worth a
   deliberate "yes" rather than happening silently as a side effect of an
   autonomous coding session.

## Install, when ready

```bash
./launchd/install.sh
```

This copies both plists to `~/Library/LaunchAgents` and loads them.
Check it's running:

```bash
launchctl list | grep readio
tail -f data/logs/*.log
```

## Uninstall

```bash
./launchd/uninstall.sh
```
