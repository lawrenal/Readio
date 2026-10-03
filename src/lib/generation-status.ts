// In-memory, single-process status for the currently running (if any)
// episode generation. Exists so the UI can show real progress that
// survives navigating away and back — a client re-checks this on
// mount, rather than relying on local component state that resets on
// remount (the bug: clicking "Generate," visiting /settings, and coming
// back used to lose the "Generating…" notice entirely). Resets on
// container restart, which is correct: nothing is actually running
// anymore either in that case.
export type GenerationStep =
  | "idle"
  | "cleaning_up"
  | "checking_items"
  | "summarizing_items"
  | "writing_script"
  | "synthesizing_audio";

// Rough share of typical total wall-clock time per step — synthesis
// dominates (it's the one doing real CPU-bound work for minutes), the
// AI calls are comparatively quick network round-trips. Used only to
// turn "which step" into an honest ballpark percentage, not a precise
// ETA — actual proportions vary with item count/script length/hardware.
const STEP_WEIGHTS: Record<GenerationStep, number> = {
  idle: 0,
  cleaning_up: 2,
  checking_items: 3,
  summarizing_items: 10,
  writing_script: 15,
  synthesizing_audio: 70,
};

const STEP_ORDER: GenerationStep[] = [
  "cleaning_up",
  "checking_items",
  "summarizing_items",
  "writing_script",
  "synthesizing_audio",
];

export const STEP_LABELS: Record<GenerationStep, string> = {
  idle: "Idle",
  cleaning_up: "Cleaning up old episodes",
  checking_items: "Checking for items",
  summarizing_items: "Summarizing items",
  writing_script: "Writing the script",
  synthesizing_audio: "Synthesizing audio",
};

export type GenerationStatus = {
  running: boolean;
  step: GenerationStep;
  /** Extra detail within a step, when available — e.g. "item 3 of 7," "chunk 12 of 45." */
  detail?: string;
  /** 0-1 fraction of *this step's own* progress, when known (e.g. chunk count) — interpolates within the step's weight. */
  stepProgress?: number;
  startedAt?: string;
};

let status: GenerationStatus = { running: false, step: "idle" };

export function getGenerationStatus(): GenerationStatus {
  return status;
}

export function startGeneration(): void {
  status = { running: true, step: "cleaning_up", startedAt: new Date().toISOString() };
}

export function setGenerationStep(step: GenerationStep, detail?: string): void {
  status = { ...status, step, detail, stepProgress: undefined };
}

export function setGenerationStepProgress(detail: string, stepProgress: number): void {
  status = { ...status, detail, stepProgress };
}

export function endGeneration(): void {
  status = { running: false, step: "idle" };
}

/**
 * Rough 0-99 estimate (never 100 while still running — the final jump
 * to "done" comes from the real POST response completing, not a
 * progress guess). Not a precise ETA, just enough to show forward
 * motion through the slow parts.
 */
export function estimatePercent(s: GenerationStatus): number {
  if (!s.running) return 0;
  const idx = STEP_ORDER.indexOf(s.step);
  if (idx === -1) return 0;
  const completedWeight = STEP_ORDER.slice(0, idx).reduce((sum, step) => sum + STEP_WEIGHTS[step], 0);
  const currentWeight = STEP_WEIGHTS[s.step] * (s.stepProgress ?? 0);
  return Math.min(99, Math.round(completedWeight + currentWeight));
}
