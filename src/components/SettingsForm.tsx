"use client";

import { useMemo, useState } from "react";
import type { SettingStatus } from "@/lib/settings";

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

function sourceLabel(source: SettingStatus["source"]): string {
  if (source === "database") return "saved here";
  if (source === "environment") return "from .env";
  return "not set";
}

type TestResult = { pending: boolean; ok?: boolean; message?: string };

export function SettingsForm({ initialSettings }: { initialSettings: SettingStatus[] }) {
  const [settings, setSettings] = useState(initialSettings);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [aiTest, setAiTest] = useState<TestResult | null>(null);
  const [ttsTest, setTtsTest] = useState<TestResult | null>(null);

  // Tests whatever's actually saved (the database/env state getLlmProvider()
  // or getTtsProvider() would read right now on the server) — not any
  // unsaved edits still sitting in the form, since those aren't real
  // until Save is clicked.
  async function testConnection(kind: "ai" | "tts") {
    const setResult = kind === "ai" ? setAiTest : setTtsTest;
    setResult({ pending: true });
    try {
      const res = await fetch(`/api/settings/test-${kind}`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        const detail =
          kind === "ai"
            ? `responded: "${data.responseText}"`
            : `${data.durationSec}s audio, ${Math.round(data.fileSizeBytes / 1024)}KB`;
        setResult({ pending: false, ok: true, message: `OK (${data.elapsedMs}ms) — ${detail}` });
      } else {
        setResult({ pending: false, ok: false, message: data.error });
      }
    } catch (e) {
      setResult({ pending: false, ok: false, message: e instanceof Error ? e.message : String(e) });
    }
  }

  // Live, not just post-save — changing a provider dropdown should
  // immediately show/hide the relevant fields, before you've hit Save.
  // Generic over *which* selector (TTS_PROVIDER, AI_PROVIDER, any future
  // one) since a field can depend on more than one — see showWhen's
  // doc comment in settings.ts (e.g. GEMINI_API_KEY is shared between
  // TTS and AI). Falls back to that selector's own registered
  // defaultValue when nothing's been set anywhere, so filtering matches
  // the real runtime default, not an ambiguous blank "Choose…" state.
  function liveValue(key: string): string {
    const def = settings.find((s) => s.key === key);
    return (edits[key] ?? def?.value ?? def?.defaultValue ?? "").toLowerCase();
  }

  const visibleSettings = useMemo(
    () =>
      settings.filter(
        (s) => !s.showWhen || s.showWhen.some((cond) => liveValue(cond.setting) === cond.value),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- liveValue closes over settings/edits, both already listed
    [settings, edits],
  );

  const groups = useMemo(() => groupBy(visibleSettings, (s) => s.group), [visibleSettings]);
  const dirtyCount = Object.keys(edits).length;

  function setEdit(key: string, value: string) {
    setMessage(null);
    setEdits((prev) => ({ ...prev, [key]: value }));
  }

  async function saveAll() {
    if (dirtyCount === 0) return;
    setSaving(true);
    setMessage(null);
    try {
      const updates = Object.entries(edits).map(([key, value]) => ({ key, value }));
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSettings(data.settings);
      setEdits({});
      setMessage("Saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function clearOverride(key: string) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: [{ key, value: "" }] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to clear");
      setSettings(data.settings);
      setEdits((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {[...groups.entries()].map(([group, items]) => {
        const testKind = group === "AI" ? "ai" : group === "Text-to-Speech" ? "tts" : null;
        const testState = testKind === "ai" ? aiTest : testKind === "tts" ? ttsTest : null;
        return (
        <section key={group} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-black/10 pb-2 dark:border-white/10">
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              {group}
            </h2>
            {testKind && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => testConnection(testKind)}
                  disabled={testState?.pending || dirtyCount > 0}
                  title={dirtyCount > 0 ? "Save your changes first — this tests the saved configuration, not unsaved edits" : undefined}
                  className="rounded border border-black/15 px-2 py-1 text-xs font-medium disabled:opacity-50 dark:border-white/20"
                >
                  {testState?.pending ? "Testing…" : "Test connection"}
                </button>
              </div>
            )}
          </div>
          {testKind && dirtyCount > 0 && (
            <p className="text-xs text-orange-600 dark:text-orange-400">
              Save your changes first — Test connection checks what&apos;s saved, not unsaved edits.
            </p>
          )}
          {testState && !testState.pending && (
            <p className={`text-xs ${testState.ok ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {testState.ok ? "✓" : "✕"} {testState.message}
            </p>
          )}
          <div className="flex flex-col gap-5">
            {items.map((setting) => (
              <div key={setting.key} className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <label htmlFor={setting.key} className="text-sm font-medium">
                    {setting.label}
                  </label>
                  <div className="flex items-center gap-2">
                    {setting.restartRequired && (
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
                        restart required
                      </span>
                    )}
                    <span className="text-xs text-zinc-500">{sourceLabel(setting.source)}</span>
                  </div>
                </div>

                {setting.type === "select" ? (
                  <select
                    id={setting.key}
                    value={edits[setting.key] ?? setting.value ?? setting.defaultValue ?? ""}
                    onChange={(e) => setEdit(setting.key, e.target.value)}
                    className="w-full rounded border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
                  >
                    <option value="" disabled={setting.hasValue || !!setting.defaultValue}>
                      {setting.hasValue || setting.defaultValue ? "" : "Choose…"}
                    </option>
                    {setting.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : setting.type === "textarea" ? (
                  <div className="flex flex-col items-end gap-1.5">
                    <textarea
                      id={setting.key}
                      // Pre-filled with the real default text (not left
                      // blank with a placeholder) so editing means
                      // "start from what it actually does now and tweak
                      // it," not "write a prompt from scratch blind."
                      value={edits[setting.key] ?? setting.value ?? setting.defaultValue ?? ""}
                      onChange={(e) => setEdit(setting.key, e.target.value)}
                      rows={10}
                      className="w-full resize-y rounded border border-black/15 bg-transparent px-3 py-2 font-mono text-xs dark:border-white/20"
                    />
                    {setting.source === "database" && (
                      <button
                        type="button"
                        onClick={() => clearOverride(setting.key)}
                        disabled={saving}
                        className="shrink-0 text-xs text-zinc-500 underline disabled:opacity-50"
                      >
                        Reset to default
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      id={setting.key}
                      type={setting.type === "password" ? "password" : "text"}
                      value={edits[setting.key] ?? (setting.secret ? "" : setting.value ?? "")}
                      onChange={(e) => setEdit(setting.key, e.target.value)}
                      placeholder={
                        setting.secret && setting.hasValue
                          ? "Already set — enter a new value to replace"
                          : setting.placeholder
                      }
                      autoComplete="off"
                      className="min-w-0 flex-1 rounded border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
                    />
                    {setting.secret && setting.source === "database" && (
                      <button
                        type="button"
                        onClick={() => clearOverride(setting.key)}
                        disabled={saving}
                        className="shrink-0 text-xs text-zinc-500 underline disabled:opacity-50"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}

                {setting.helpText && (
                  <p className="text-xs text-zinc-500">{setting.helpText}</p>
                )}
              </div>
            ))}
          </div>
        </section>
        );
      })}

      <div className="sticky bottom-0 -mx-4 flex items-center gap-3 border-t border-black/10 bg-zinc-50 px-4 py-3 sm:-mx-6 sm:px-6 dark:border-white/10 dark:bg-black">
        <button
          type="button"
          onClick={saveAll}
          disabled={saving || dirtyCount === 0}
          className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {saving ? "Saving…" : dirtyCount > 0 ? `Save ${dirtyCount} change${dirtyCount === 1 ? "" : "s"}` : "Save changes"}
        </button>
        {message && <span className="text-sm text-zinc-500">{message}</span>}
      </div>
    </div>
  );
}
