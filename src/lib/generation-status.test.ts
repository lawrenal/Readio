import { describe, expect, it } from "vitest";
import { estimatePercent, type GenerationStatus } from "./generation-status";

function status(overrides: Partial<GenerationStatus>): GenerationStatus {
  return { running: true, step: "idle", ...overrides };
}

describe("estimatePercent", () => {
  it("returns 0 when not running", () => {
    expect(estimatePercent(status({ running: false, step: "synthesizing_audio" }))).toBe(0);
  });

  it("returns 0 for the idle step even if running is true", () => {
    expect(estimatePercent(status({ step: "idle" }))).toBe(0);
  });

  it("increases monotonically through the step order", () => {
    const steps = [
      "cleaning_up",
      "checking_items",
      "summarizing_items",
      "writing_script",
      "synthesizing_audio",
    ] as const;
    let last = -1;
    for (const step of steps) {
      const pct = estimatePercent(status({ step }));
      expect(pct).toBeGreaterThan(last);
      last = pct;
    }
  });

  it("interpolates within a step using stepProgress", () => {
    const start = estimatePercent(status({ step: "synthesizing_audio", stepProgress: 0 }));
    const mid = estimatePercent(status({ step: "synthesizing_audio", stepProgress: 0.5 }));
    const almostDone = estimatePercent(status({ step: "synthesizing_audio", stepProgress: 1 }));
    expect(mid).toBeGreaterThan(start);
    expect(almostDone).toBeGreaterThan(mid);
  });

  it("never reaches 100 while still running, even at full step progress", () => {
    expect(estimatePercent(status({ step: "synthesizing_audio", stepProgress: 1 }))).toBeLessThanOrEqual(99);
  });
});
