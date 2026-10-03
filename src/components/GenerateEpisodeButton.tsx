"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Status = {
  running: boolean;
  step: string;
  stepLabel: string;
  detail: string | null;
  percent: number;
};

const POLL_MS = 2000;

export function GenerateEpisodeButton({ kind = "daily" }: { kind?: "daily" | "weekly" }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function pollStatus(): Promise<Status | null> {
    try {
      const res = await fetch("/api/episodes/generate");
      const data: Status = await res.json();
      setStatus(data);
      if (!data.running) stopPolling();
      return data;
    } catch {
      return null;
    }
  }

  function startPolling() {
    if (pollRef.current) return;
    pollRef.current = setInterval(pollStatus, POLL_MS);
  }

  // Runs on every mount — including remounting after navigating to
  // /settings and back. A generation already in progress (started
  // before this component unmounted, or by the nightly cron) gets
  // picked back up here instead of silently losing track of it, since
  // this reads real server state rather than relying on local state
  // that resets when the component remounts.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await pollStatus();
      if (!cancelled && data?.running) startPolling();
    })();
    return () => {
      cancelled = true;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-only
  }, []);

  async function generate() {
    setMessage(null);
    // Fire the request, then poll for progress immediately — the POST
    // itself won't resolve until the entire generation finishes
    // (potentially 20+ minutes), so waiting on it alone would leave the
    // UI looking frozen the whole time.
    const postPromise = fetch("/api/episodes/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: kind }),
    });
    await pollStatus();
    startPolling();

    try {
      const res = await postPromise;
      const data = await res.json();
      stopPolling();
      await pollStatus();
      if (!res.ok) {
        setMessage(`Error: ${data.error}`);
      } else if (data.skipped) {
        setMessage(`Skipped: ${data.reason}`);
      } else {
        setMessage(kind === "weekly" ? "Deep-dive episode generated." : "Episode generated.");
        router.refresh();
      }
    } catch (e) {
      stopPolling();
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  const running = status?.running ?? false;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={generate}
          disabled={running}
          className="rounded border border-black/15 px-3 py-1.5 text-xs font-medium disabled:opacity-50 dark:border-white/20"
        >
          {running
            ? "Generating…"
            : kind === "weekly"
              ? "Generate deep dive now"
              : "Generate tonight's episode now"}
        </button>
        {!running && message && <span className="text-xs text-zinc-500">{message}</span>}
      </div>
      {running && status && (
        <div className="flex flex-col gap-1">
          <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
            <div
              className="h-full rounded-full bg-foreground transition-[width] duration-500"
              style={{ width: `${status.percent}%` }}
            />
          </div>
          <span className="text-xs text-zinc-500">
            {status.stepLabel}
            {status.detail ? ` — ${status.detail}` : ""} ({status.percent}%)
          </span>
        </div>
      )}
    </div>
  );
}
