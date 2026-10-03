import { getLlmProvider, isAiConfigured } from "./llm";
import { getSetting } from "./settings";
import {
  DEFAULT_DAILY_SCRIPT_PROMPT,
  DEFAULT_WEEKLY_SCRIPT_PROMPT,
  DEFAULT_EPISODE_SUMMARY_PROMPT,
} from "./prompts";

export { isAiConfigured };

// Rough cap to keep per-item summarization cheap and fast even for very
// long transcripts/articles. Truncation is logged, not silent — see
// human-eyes.md for why this exists and what it trades off.
const MAX_SOURCE_CHARS = 12_000;

function truncate(text: string, label: string): string {
  if (text.length <= MAX_SOURCE_CHARS) return text;
  console.warn(`[ai] Truncating ${label} from ${text.length} to ${MAX_SOURCE_CHARS} chars for summarization`);
  return text.slice(0, MAX_SOURCE_CHARS);
}

// Exported for direct unit testing (see ai.test.ts) — everything else in
// this file needs a real API call to exercise.
export function extractJson(text: string): unknown {
  // Models sometimes wrap JSON in prose or a fenced code block despite
  // instructions not to — scan for the first balanced {...} block
  // defensively. A regex like /\{[\s\S]*\}/ is greedy and would capture
  // through to the *last* '}' in the whole response (e.g. trailing prose
  // that itself contains braces), so this walks brace depth by hand,
  // ignoring braces inside string literals.
  const start = text.indexOf("{");
  if (start === -1) {
    throw new Error(`No JSON object found in model response: ${text.slice(0, 200)}`);
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }

  throw new Error(`No complete JSON object found in model response: ${text.slice(0, 200)}`);
}

export type ItemSummary = {
  summary: string;
  keyFacts: string[];
  tags: string[];
};

export async function summarizeItem(input: {
  title: string;
  text: string;
}): Promise<ItemSummary> {
  const llm = await getLlmProvider();
  const text = truncate(input.text, input.title);

  const responseText = await llm.complete({
    tier: "summary",
    maxTokens: 1024,
    system:
      "You extract structured summaries from articles/video transcripts for a personal " +
      "podcast pipeline. Respond with ONLY a JSON object, no prose, no code fences, in " +
      'exactly this shape: {"summary": string (2-3 sentences), "keyFacts": string[] ' +
      "(3-6 concrete facts stated in the source — nothing inferred or added), " +
      '"tags": string[] (2-5 short topic tags)}.',
    user: `Title: ${input.title}\n\n${text}`,
  });

  const parsed = extractJson(responseText) as Partial<ItemSummary>;
  if (
    typeof parsed.summary !== "string" ||
    !Array.isArray(parsed.keyFacts) ||
    !Array.isArray(parsed.tags)
  ) {
    throw new Error(`Model response didn't match expected shape: ${responseText.slice(0, 200)}`);
  }

  return {
    summary: parsed.summary,
    keyFacts: parsed.keyFacts.map(String),
    tags: parsed.tags.map(String),
  };
}

export type ScriptSourceItem = {
  id: string;
  title: string;
  type: string;
  summary: string;
  keyFacts: string[];
  text: string; // full extracted text/transcript, used as grounding
};

const WORDS_PER_MINUTE = 150;

export type EpisodeKind = "daily" | "weekly";

export async function writeEpisodeScript(
  items: ScriptSourceItem[],
  maxMinutes: number,
  kind: EpisodeKind = "daily",
): Promise<string> {
  const llm = await getLlmProvider();
  const maxWords = maxMinutes * WORDS_PER_MINUTE;

  const sourceBlocks = items
    .map((item, i) => {
      const facts = item.keyFacts.length ? `\nKey facts:\n- ${item.keyFacts.join("\n- ")}` : "";
      return (
        `[Item ${i + 1}] "${item.title}" (${item.type})\n` +
        `Summary: ${item.summary}${facts}\n` +
        `Full text (grounding — do not state anything about this item beyond what's here):\n` +
        `${truncate(item.text, item.title)}`
      );
    })
    .join("\n\n---\n\n");

  // Editable on /settings (EPISODE_SCRIPT_PROMPT_DAILY/_WEEKLY) — a saved
  // override replaces the built-in instructions entirely, not just
  // appends to them, so a user can fully rewrite tone/behavior. {{maxWords}}
  // and {{maxMinutes}} are filled in here regardless of which text is in
  // play, built-in or overridden.
  const promptKey = kind === "weekly" ? "EPISODE_SCRIPT_PROMPT_WEEKLY" : "EPISODE_SCRIPT_PROMPT_DAILY";
  const defaultPrompt = kind === "weekly" ? DEFAULT_WEEKLY_SCRIPT_PROMPT : DEFAULT_DAILY_SCRIPT_PROMPT;
  const promptTemplate = (await getSetting(promptKey)) || defaultPrompt;
  const system = promptTemplate
    .replaceAll("{{maxWords}}", String(maxWords))
    .replaceAll("{{maxMinutes}}", String(maxMinutes));

  const itemsLabel = kind === "weekly" ? "this week's starred items" : "today's items";

  return llm.complete({
    tier: "script",
    maxTokens: 16000,
    system,
    user: `Here are ${itemsLabel}:\n\n${sourceBlocks}`,
  });
}

// Defensive, not just a prompt instruction — models have a habit of
// drifting past a requested length (see the Kokoro chunking saga in
// human-eyes.md for a similar lesson about not trusting "should respect
// this limit"). This is display copy in a fixed UI slot, so enforcing
// the cap in code rather than just asking nicely avoids a layout surprise
// if the model ever returns a 6-sentence "summary." Exported for direct
// unit testing — see ai.test.ts.
export function takeSentences(text: string, max: number): string {
  const sentences = text.trim().match(/[^.!?]+[.!?]+(?=\s|$)/g);
  if (!sentences || sentences.length <= max) return text.trim();
  // Each match can carry its own leading whitespace from the original
  // text (the regex doesn't consume the separating space, so it's part
  // of the *next* sentence's match) — trim each piece before rejoining,
  // or adding a space in the join doubles up.
  return sentences
    .slice(0, max)
    .map((s) => s.trim())
    .join(" ");
}

/**
 * A short (≤3 sentence) teaser summary of an already-written episode
 * script, for display in the episode list — separate from (and much
 * cheaper than) the script-writing call itself, since summarizing
 * existing narration is a simple extractive task, not creative writing.
 * Reuses the same "cheap/bulk" model tier as per-item summaries.
 */
export async function summarizeEpisode(script: string): Promise<string> {
  const llm = await getLlmProvider();

  // Editable on /settings (EPISODE_SUMMARY_PROMPT).
  const system = (await getSetting("EPISODE_SUMMARY_PROMPT")) || DEFAULT_EPISODE_SUMMARY_PROMPT;

  const responseText = await llm.complete({
    tier: "summary",
    maxTokens: 256,
    system,
    user: script,
  });

  return takeSentences(responseText, 3);
}
