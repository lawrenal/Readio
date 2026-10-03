import { prisma } from "@/lib/prisma";
import { AddLinkForm } from "@/components/AddLinkForm";
import { ItemRow } from "@/components/ItemRow";
import { EpisodeRow } from "@/components/EpisodeRow";
import { FeedUrl } from "@/components/FeedUrl";
import { GenerateEpisodeButton } from "@/components/GenerateEpisodeButton";
import { dayLabel, groupByLocalDay, localDateKey } from "@/lib/group-by-day";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [items, episodes] = await Promise.all([
    prisma.item.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.episode.findMany({ orderBy: { date: "desc" } }),
  ]);

  // Grouped by the same local-calendar-day boundary buildDailyEpisode uses
  // to decide what's in which night's episode — so a date header here
  // actually tells you which episode a link belongs/belonged to.
  const itemGroups = groupByLocalDay(items, (item) => item.createdAt);

  // Starred items already show inline in the day-grouped list below (the
  // star toggle lives on every ItemRow regardless), but there was no way
  // to see *just* the current deep-dive queue at a glance, or unstar
  // something without hunting through the full list for it. A plain
  // filter of the same `items` already fetched above — no extra query.
  const starredItems = items.filter((item) => item.starred);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Readio
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Send in links throughout the day. Tonight&apos;s episode picks up
          everything below.
        </p>
      </div>

      <AddLinkForm />

      {starredItems.length > 0 && (
        <div className="flex flex-col gap-2 rounded border border-amber-400/40 bg-amber-50/50 p-4 dark:border-amber-400/20 dark:bg-amber-400/5">
          <h2 className="text-sm font-bold tracking-tight text-foreground">
            ★ Starred for this week&apos;s deep dive ({starredItems.length})
          </h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            These go into Saturday&apos;s deep-dive episode, then unstar
            themselves automatically — unstar anything here you&apos;ve
            changed your mind about.
          </p>
          <ul className="flex flex-col divide-y divide-black/10 dark:divide-white/10">
            {starredItems.map((item) => (
              <ItemRow
                key={item.id}
                item={{ ...item, createdAt: item.createdAt.toISOString() }}
              />
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col">
        {items.length === 0 && (
          <p className="py-6 text-sm text-zinc-500">
            Nothing added yet — paste a link above to get started.
          </p>
        )}
        {itemGroups.map((group) => (
          <div key={group.dayKey}>
            <h3 className="mt-6 border-b border-black/10 pb-2 text-lg font-bold tracking-tight text-foreground first:mt-0 dark:border-white/10">
              {dayLabel(group.dayKey)}
            </h3>
            <ul className="flex flex-col divide-y divide-black/10 dark:divide-white/10">
              {group.items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={{ ...item, createdAt: item.createdAt.toISOString() }}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 border-t border-black/10 pt-6 dark:border-white/10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Episodes</h2>
          <div className="flex flex-wrap items-center gap-2">
            <GenerateEpisodeButton />
            <GenerateEpisodeButton kind="weekly" />
          </div>
        </div>
        <FeedUrl />
        <ul className="flex flex-col divide-y divide-black/10 dark:divide-white/10">
          {episodes.length === 0 && (
            <li className="py-4 text-sm text-zinc-500">No episodes generated yet.</li>
          )}
          {episodes.map((ep) => (
            <EpisodeRow
              key={ep.id}
              // Local "YYYY-MM-DD", resolved here on the server — see rss.ts.
              episode={{ ...ep, date: localDateKey(ep.date) }}
            />
          ))}
        </ul>
      </div>
    </main>
  );
}
