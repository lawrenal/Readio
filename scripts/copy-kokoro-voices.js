#!/usr/bin/env node
// kokoro-js resolves its voice embedding files relative to its own
// compiled module's __dirname/import.meta.dirname — normally
// node_modules/kokoro-js/voices/. Next.js's bundler (Turbopack), for
// this serverExternalPackages module, resolves that reference to
// <project root>/src/generated/voices/ instead — reproduced identically
// via `next dev`, `next start`, and inside the Docker image, so this
// isn't a Docker-specific quirk, and chasing Turbopack's exact internal
// reason for the mismatch isn't necessary: satisfying the path it
// actually looks for, deterministically, on every `npm install`/`npm ci`
// (in any environment) is the reliable fix. See TODO.md and
// human-eyes.md for how this was found.
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "node_modules", "kokoro-js", "voices");
const dest = path.join(__dirname, "..", "src", "generated", "voices");

if (!fs.existsSync(src)) {
  // kokoro-js isn't installed (e.g. a partial/dev-only install) — nothing to do.
  process.exit(0);
}

fs.mkdirSync(dest, { recursive: true });
const files = fs.readdirSync(src);
for (const file of files) {
  fs.copyFileSync(path.join(src, file), path.join(dest, file));
}
console.log(`[postinstall] Copied ${files.length} Kokoro voice files to src/generated/voices`);
