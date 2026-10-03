import { isAiConfigured, writeEpisodeScript, type EpisodeKind, type ScriptSourceItem } from "./ai";

export type ScriptResult = {
  text: string;
  method: "ai" | "template";
  note?: string;
};

/**
 * Naive, no-AI fallback: reads each item back with its title and whatever
 * text we have, in submission order, with a generic transition between
 * each. No real clustering or narrative — just enough to prove the rest of
 * the pipeline (TTS, RSS, episode assembly) end-to-end without an API key.
 * Swaps out automatically the moment an AI provider is configured.
 */
function writeTemplateScript(items: ScriptSourceItem[], kind: EpisodeKind): string {
  const intro =
    kind === "weekly"
      ? `Here's this week's deep dive — ${items.length} starred item${items.length === 1 ? "" : "s"}.`
      : `Here's what came in today — ${items.length} item${items.length === 1 ? "" : "s"}.`;
  const parts: string[] = [intro];

  items.forEach((item, i) => {
    const lead = i === 0 ? "First up" : i === items.length - 1 ? "Last up" : "Next";
    const body = item.summary || item.text.slice(0, 600);
    parts.push(`${lead}: "${item.title}". ${body}`);
  });

  parts.push(kind === "weekly" ? "That's the deep dive for this week." : "That's everything for today.");
  return parts.join("\n\n");
}

export async function generateScript(
  items: ScriptSourceItem[],
  maxMinutes: number,
  kind: EpisodeKind = "daily",
): Promise<ScriptResult> {
  if (!(await isAiConfigured())) {
    return {
      text: writeTemplateScript(items, kind),
      method: "template",
      // Generic on purpose — since multi-provider support landed, this
      // used to hardcode "ANTHROPIC_API_KEY not set" even when a
      // different provider was selected and *that* one's key was
      // missing, which was just wrong and misleading. Point at
      // /settings rather than naming a specific provider's env var.
      note: "No AI provider configured — used the plain template writer, not real clustering/narration. Check /settings.",
    };
  }

  try {
    const text = await writeEpisodeScript(items, maxMinutes, kind);
    return { text, method: "ai" };
  } catch (e) {
    console.error("[episode-script] AI script generation failed, falling back to template:", e);
    return {
      text: writeTemplateScript(items, kind),
      method: "template",
      note: `AI script generation failed (${e instanceof Error ? e.message : String(e)}) — used the plain template writer instead.`,
    };
  }
}
