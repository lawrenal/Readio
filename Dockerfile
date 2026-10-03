# Multi-stage build for running Readio on Linux (home-lab Docker
# host) instead of only on macOS. See human-eyes.md for what is and
# isn't verified about this — it was written and reasoned through
# carefully, but built in an environment with no Docker daemon to
# actually run it in, so treat the first real `docker build` as the
# real test.
#
# Node version: pinned to the 22.x LTS line deliberately, not matched to
# whatever Node version this was developed with (26.x) — 22 is a
# widely-available, long-established tag I'm confident exists on Docker
# Hub; a newer major might not be published yet by the time you build
# this. Bump it if you want parity with the dev environment and confirm
# the tag exists first.
#
# Debian-slim (not Alpine) deliberately — better-sqlite3, onnxruntime-node,
# and sharp all ship prebuilt binaries for glibc; Alpine's musl libc means
# a much higher chance of falling back to a from-source compile (needing
# a full build toolchain) or missing prebuilts entirely.

FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
# scripts/ has to be in place before `npm ci` — it runs the postinstall
# hook (scripts/copy-kokoro-voices.js) as part of that command. Same fix
# as the runner stage below; this stage has the identical ordering issue.
COPY scripts ./scripts
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build


FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# ffmpeg replaces macOS's afconvert/afinfo (see src/lib/tts.ts) —
# the actual reason this container needed to exist as more than a
# straight copy-and-run of the mac-native code. tzdata is needed for the
# TZ env var (set in docker-compose.yml) to actually resolve named zones
# like "America/Los_Angeles" — without it, Node silently falls back to
# UTC despite TZ being set, which would break this app's local-midnight/
# 9pm-local scheduling logic.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg tzdata \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
# scripts/ has to be in place before `npm ci` below — it runs the
# postinstall hook (scripts/copy-kokoro-voices.js) as part of that
# command, which fails immediately if the file it's trying to run
# doesn't exist yet.
COPY scripts ./scripts
# Reinstalls (and rebuilds native addons: better-sqlite3, onnxruntime-node,
# sharp) for *this* image's actual OS/architecture — don't copy
# node_modules from the builder stage, which may differ if builder and
# runner ever end up on different base images or platforms.
RUN npm ci --omit=dev

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/prisma7.config.ts ./prisma7.config.ts
# kokoro-js's voice files land at src/generated/voices automatically via
# the postinstall script triggered by `npm ci --omit=dev` above — see
# scripts/copy-kokoro-voices.js for why this is needed at all.

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# data/ (SQLite db, generated audio, uploaded PDFs, logs, the Kokoro
# model cache) is meant to be a mounted volume — see docker-compose.yml.
# Created here so the app doesn't fail on first write if the volume
# mount hasn't populated it yet.
RUN mkdir -p /app/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
