import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (via pdfjs-dist) sets up a worker file at runtime in a way
  // Turbopack's bundler doesn't resolve correctly. Load it as a native
  // Node module instead of bundling it. Kokoro's dependency chain
  // (onnxruntime-node's .node native binding, sharp's native image libs)
  // is the same kind of thing — added proactively before hitting the
  // same class of runtime error, not because it's been observed yet.
  serverExternalPackages: [
    "pdf-parse",
    "pdfjs-dist",
    "kokoro-js",
    "@huggingface/transformers",
    "onnxruntime-node",
    "sharp",
  ],

  // Next.js's dev server blocks cross-origin requests to its HMR/client
  // JS bundle by default. Without this, loading the app from another
  // machine on the LAN (e.g. http://192.168.1.50:3000) serves the page
  // but silently fails to hydrate it — inputs/buttons look present but
  // don't respond, since React never attaches. No portable default
  // exists (every LAN's IP range differs, and Next doesn't support CIDR
  // matching here — see allowedDevOrigins.md) — set
  // NEXT_DEV_ALLOWED_ORIGIN to your own machine's LAN IP if you want to
  // preview `npm run dev` from another device.
  allowedDevOrigins: process.env.NEXT_DEV_ALLOWED_ORIGIN
    ? [process.env.NEXT_DEV_ALLOWED_ORIGIN]
    : [],

  experimental: {
    // Every route runs through src/proxy.ts, and with a proxy present
    // Next buffers request bodies and silently *truncates* them at 10MB
    // by default — a print-to-PDF upload with images easily exceeds that
    // and would reach the PDF route corrupted. Kept in sync with
    // MAX_PDF_BYTES in src/app/api/items/[id]/pdf/route.ts.
    proxyClientMaxBodySize: "50mb",
  },
};

export default nextConfig;
