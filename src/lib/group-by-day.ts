// Local calendar day (not UTC) — matches the day boundary buildDailyEpisode
// uses to decide which items belong to which night's episode (see
// localDayWindow in episode.ts). Grouping items this same way is what
// makes a date header actually correspond to "which episode this link
// would be/was in," not just an arbitrary date string.
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function groupByLocalDay<T>(
  items: T[],
  getDate: (item: T) => Date,
): { dayKey: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = localDateKey(getDate(item));
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.entries()].map(([dayKey, groupItems]) => ({ dayKey, items: groupItems }));
}

// `dayKey` is "YYYY-MM-DD" — parsed back via Date(y, m, d) (local time),
// not `new Date(dayKey)` (which parses as UTC midnight and can land on
// the wrong calendar day once formatted back in a non-UTC timezone).
export function dayLabel(dayKey: string, now: Date = new Date()): string {
  if (dayKey === localDateKey(now)) return "Today";

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey === localDateKey(yesterday)) return "Yesterday";

  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
