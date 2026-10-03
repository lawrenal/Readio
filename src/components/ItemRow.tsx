"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { StatusBadge } from "./StatusBadge";

type Item = {
  id: string;
  url: string;
  rawUrl: string;
  title: string | null;
  type: string;
  status: string;
  failureReason: string | null;
  starred: boolean;
  createdAt: string;
};

export function ItemRow({ item }: { item: Item }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function toggleStar() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starred: !item.starred }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to star");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/items/${item.id}/retry`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Retry failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeItem() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/items/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Delete failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function uploadPdf(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/items/${item.id}/pdf`, { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json()).error ?? "PDF upload failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <a
            href={item.rawUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-sm font-medium hover:underline"
          >
            {item.title || item.rawUrl}
          </a>
          <p className="truncate text-xs text-zinc-500">
            {item.title ? `${item.rawUrl} · ` : ""}
            {item.type} · added {new Date(item.createdAt).toLocaleString()}
            {item.failureReason && (
              <span className="text-red-600 dark:text-red-400"> · {item.failureReason}</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={toggleStar}
            disabled={busy}
            title={item.starred ? "Unstar" : "Star for the weekly deep-dive"}
            className="text-lg leading-none disabled:opacity-50"
          >
            {item.starred ? "★" : "☆"}
          </button>
          <StatusBadge status={item.status} />
          {(item.status === "needs_pdf" || item.status === "failed") && (
            <button
              type="button"
              onClick={retry}
              disabled={busy}
              className="text-xs text-zinc-500 underline disabled:opacity-50"
            >
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={removeItem}
            disabled={busy}
            className="text-xs text-zinc-400 hover:text-red-600 disabled:opacity-50"
            title="Remove"
          >
            ✕
          </button>
        </div>
      </div>

      {item.status === "needs_pdf" && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-dashed border-orange-300 bg-orange-50 px-3 py-2 text-xs dark:border-orange-900 dark:bg-orange-950/40">
          <span className="min-w-0 flex-1">
            Couldn&apos;t fetch this automatically. Print the page to PDF (⌘P → Save as PDF) and upload it:
          </span>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadPdf(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className="shrink-0 rounded bg-orange-200 px-2 py-1 font-medium dark:bg-orange-900"
          >
            Upload PDF
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </li>
  );
}
