"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Episode = {
  id: string;
  type: string;
  /** Local calendar day, "YYYY-MM-DD". */
  date: string;
  durationSec: number;
  notes: string | null;
  summary: string | null;
};

export function EpisodeRow({ episode }: { episode: Episode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteEpisode() {
    if (!window.confirm("Delete this episode and its audio file? This can't be undone.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/episodes/${episode.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Delete failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {episode.type === "weekly" ? "Weekly Deep Dive" : "Daily Digest"} —{" "}
          {episode.date}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">
            {Math.round(episode.durationSec / 60)} min
          </span>
          <button
            type="button"
            onClick={deleteEpisode}
            disabled={busy}
            className="text-xs text-zinc-400 hover:text-red-600 disabled:opacity-50"
            title="Delete episode"
          >
            ✕
          </button>
        </div>
      </div>
      {episode.summary && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{episode.summary}</p>
      )}
      {/* preload="none" — an episode's audio can be several MB; no reason
          to download it just because the page loaded, only once someone
          actually presses play. */}
      <audio controls preload="none" className="w-full" src={`/audio/${episode.id}`}>
        Your browser doesn&apos;t support inline audio —{" "}
        <a href={`/audio/${episode.id}`} className="underline">
          download the episode
        </a>{" "}
        instead.
      </audio>
      {episode.notes && (
        <p className="text-xs text-orange-600 dark:text-orange-400">{episode.notes}</p>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </li>
  );
}
