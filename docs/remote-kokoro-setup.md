# Remote Kokoro setup: mlx-audio on Apple Silicon

Local Kokoro synthesis (the default TTS path) runs on whatever CPU is
hosting Readio, which can make it the slowest step in generating an
episode on modest hardware. [mlx-audio](https://github.com/Blaizzy/mlx-audio)
runs Kokoro on Apple's MLX framework instead — real Metal/GPU
acceleration on an Apple Silicon Mac, a genuine speed win rather than
just moving the same CPU work to a different machine.

This walks through getting it running as an always-on background service
on a Mac, including every real snag that came up getting there — each of
these caused the server to fail in a way that looked unrelated to its
actual cause, so they're documented explicitly rather than glossed over.

## Install

```bash
brew install ffmpeg espeak-ng
python3 -m venv ~/mlx-audio-env
source ~/mlx-audio-env/bin/activate
pip install "mlx-audio[server]"
pip install "spacy==3.8.16" phonemizer espeakng-loader num2words
```

**Why the extra `pip install` line, not just `mlx-audio[server]` alone:**
`misaki` (mlx-audio's text-processing dependency for English) declares an
`en` extra (`misaki[en]`) that's supposed to pull in everything needed —
but as of this writing, that extra also drags in `spacy-curated-transformers`,
which backtracks pip's resolver into `spacy==4.0.0.dev3`, a pre-release
that fails to compile `blis` from source against a newer numpy/Cython.
Installing `spacy==3.8.16` directly (a version with a prebuilt wheel)
plus the other three packages by hand sidesteps that entirely.

## Run it once to confirm it works

```bash
mlx_audio.server --host 0.0.0.0 --port 8000
```

Test it from another machine:

```bash
curl -X POST http://<mac-ip>:8000/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"model":"mlx-community/Kokoro-82M-bf16","input":"Testing.","voice":"af_heart"}' \
  --output test.mp3
```

If that produces a real playable MP3, point Readio's `KOKORO_REMOTE_BASE_URL`
at `http://<mac-ip>:8000/v1` (see [tts-providers.md](./tts-providers.md))
and you're done for a quick test. For anything long-term, keep going —
you want this running unattended, surviving reboots.

## Running it as a background service (LaunchAgent, not LaunchDaemon)

It needs to be a **LaunchAgent** (runs in your own user session), not a
**LaunchDaemon** (runs as root/system). On Apple Silicon, a system
LaunchDaemon trying to `posix_spawn` an unsigned venv binary via a
`UserName` privilege drop gets rejected outright —
`posix_spawn(...), error 0x1 - Operation not permitted` — regardless of
file permissions. A LaunchAgent never needs that privilege drop in the
first place.

```bash
mkdir -p ~/mlx-audio-logs

cat > ~/Library/LaunchAgents/com.readio.mlxaudio.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.readio.mlxaudio</string>
    <key>WorkingDirectory</key>
    <string>/Users/YOUR_USERNAME/mlx-audio-logs</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/YOUR_USERNAME/mlx-audio-env/bin/mlx_audio.server</string>
        <string>--host</string>
        <string>0.0.0.0</string>
        <string>--port</string>
        <string>8000</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/YOUR_USERNAME/mlx-audio-logs/mlx-audio.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/YOUR_USERNAME/mlx-audio-logs/mlx-audio.log</string>
</dict>
</plist>
EOF

launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.readio.mlxaudio.plist
launchctl list | grep mlxaudio   # should show a real PID, not "-"
```

Two more things this plist works around, both worth knowing if you're
troubleshooting a variant setup:

- **`WorkingDirectory` can't be on certain external/removable volumes.**
  If `mlx_audio.server` tries to `mkdir` a relative `logs/` directory in
  its working directory and that directory is on an external volume,
  launchd/TCC can silently refuse the spawn for *any* program, not just
  this one. Point `WorkingDirectory` at somewhere on your main internal
  volume (your home directory is fine).
- **launchd gives spawned processes a minimal `PATH`** — it doesn't
  include `/opt/homebrew/bin`, so even though `ffmpeg` is installed and
  on *your* shell's PATH, the service can't find it unless `PATH` is set
  explicitly via `EnvironmentVariables` as shown above. Without this,
  synthesis fails at the final MP3-encoding step with `ffmpeg not found!`
  even though `which ffmpeg` works fine in your terminal.

## Keeping the log from growing forever

Since launchd itself holds the file open (via `StandardOutPath`), a
rename-based log rotator won't work cleanly — launchd keeps writing to
the renamed file until the process restarts. Truncating the file in
place (same inode) avoids needing a restart:

```bash
cat > ~/Library/LaunchAgents/com.readio.mlxaudio-logrotate.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.readio.mlxaudio-logrotate</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/truncate</string>
        <string>-s</string>
        <string>0</string>
        <string>/Users/YOUR_USERNAME/mlx-audio-logs/mlx-audio.log</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Weekday</key>
        <integer>0</integer>
        <key>Hour</key>
        <integer>3</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
</dict>
</plist>
EOF
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.readio.mlxaudio-logrotate.plist
```

Wipes the log every Sunday at 3am.

## Making sure it survives a reboot

A LaunchAgent only starts when you log in — not at raw boot before any
login. On a headless Mac Mini used as a server, enable **automatic
login**: System Settings → Users & Groups → Login Options → Automatic
login. Also disable sleep (System Settings → Energy) — a sleeping Mac
won't respond to requests at all regardless of what's running.

## Troubleshooting checklist

| Symptom | Cause |
|---|---|
| `ModuleNotFoundError: No module named 'misaki'` or similar at request time | `misaki[en]`'s real dependencies never fully installed — see the pinned-spacy install above |
| `ffmpeg not found!` even though it's installed | launchd's minimal `PATH` — add `EnvironmentVariables` to the plist |
| `posix_spawn(...), error 0x1 - Operation not permitted` | Using a LaunchDaemon instead of a LaunchAgent on Apple Silicon |
| `Read-only file system: 'logs'` or the service just won't start | `WorkingDirectory` is on an external/removable volume |
| `launchctl list` shows `-` for PID with a nonzero exit status | Check `log show --last 2m --predicate 'eventMessage CONTAINS "posix_spawn"'` for the real underlying error — launchd's own error messages are often more specific than what shows up in your own log file |
