import { describe, expect, it } from "vitest";
import { dayLabel, groupByLocalDay, localDateKey } from "./group-by-day";

describe("localDateKey", () => {
  it("formats using local date components, not UTC", () => {
    // 11pm local time should still be "today," not roll to UTC's next day.
    const d = new Date(2026, 8, 30, 23, 0, 0); // Sep 30, 2026, 11pm local
    expect(localDateKey(d)).toBe("2026-09-30");
  });

  it("pads single-digit months and days", () => {
    const d = new Date(2026, 0, 5); // Jan 5, 2026
    expect(localDateKey(d)).toBe("2026-01-05");
  });
});

describe("groupByLocalDay", () => {
  it("groups items by calendar day, preserving first-seen order", () => {
    const items = [
      { id: "a", createdAt: new Date(2026, 8, 30, 9) },
      { id: "b", createdAt: new Date(2026, 8, 30, 20) },
      { id: "c", createdAt: new Date(2026, 8, 29, 10) },
    ];
    const groups = groupByLocalDay(items, (i) => i.createdAt);
    expect(groups).toHaveLength(2);
    expect(groups[0].dayKey).toBe("2026-09-30");
    expect(groups[0].items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(groups[1].dayKey).toBe("2026-09-29");
    expect(groups[1].items.map((i) => i.id)).toEqual(["c"]);
  });

  it("returns an empty array for no items", () => {
    expect(groupByLocalDay([], (i: { createdAt: Date }) => i.createdAt)).toEqual([]);
  });
});

describe("dayLabel", () => {
  const now = new Date(2026, 8, 30, 12); // Sep 30, 2026, noon

  it("labels today's key as 'Today'", () => {
    expect(dayLabel("2026-09-30", now)).toBe("Today");
  });

  it("labels yesterday's key as 'Yesterday'", () => {
    expect(dayLabel("2026-09-29", now)).toBe("Yesterday");
  });

  it("formats older dates as a full weekday/month/day string", () => {
    expect(dayLabel("2026-09-20", now)).toBe("Sunday, September 20");
  });

  it("doesn't misclassify a late-night 'today' near a UTC day boundary", () => {
    // Regression guard: a naive `new Date(dayKey)` parse (UTC midnight)
    // would shift this backward a day in a negative-UTC-offset timezone.
    const lateNight = new Date(2026, 8, 30, 23, 59);
    expect(dayLabel(localDateKey(lateNight), lateNight)).toBe("Today");
  });
});
