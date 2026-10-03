import { NextResponse } from "next/server";
import { getLlmProvider } from "@/lib/llm";

// A short, cheap real request against whichever AI provider is currently
// configured — so a wrong model name, bad base URL, or bad key shows up
// in seconds instead of only being discovered 15+ minutes into a real
// generation run. Found the need for this the hard way: a misconfigured
// Ollama/OpenWebUI model name only surfaced after a long wait, and a
// slow-but-alive local model was briefly indistinguishable from a
// genuinely hung connection. Short timeout here specifically (not the
// 5-minute production default) — this is meant to fail fast.
const TEST_TIMEOUT_MS = 20_000;

export async function POST() {
  const startedAt = Date.now();
  try {
    const llm = await getLlmProvider();
    const text = await llm.complete({
      system: "Reply with exactly one word: OK",
      user: "Connection test.",
      maxTokens: 10,
      tier: "summary",
      timeoutMs: TEST_TIMEOUT_MS,
    });
    return NextResponse.json({
      ok: true,
      responseText: text.slice(0, 200),
      elapsedMs: Date.now() - startedAt,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      elapsedMs: Date.now() - startedAt,
    });
  }
}
