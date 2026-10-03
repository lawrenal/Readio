import { prisma } from "./prisma";
import {
  DEFAULT_DAILY_SCRIPT_PROMPT,
  DEFAULT_WEEKLY_SCRIPT_PROMPT,
  DEFAULT_EPISODE_SUMMARY_PROMPT,
} from "./prompts";
import { encryptSettingValue, decryptSettingValue } from "./settings-crypto";

export type SettingInputType = "password" | "text" | "textarea" | "select";

export interface SettingDef {
  key: string;
  label: string;
  group: string;
  type: SettingInputType;
  /** Masked in the UI, never returned to the client once saved. */
  secret: boolean;
  options?: { value: string; label: string }[];
  helpText?: string;
  /** Read once at server startup (the in-process scheduler) — a saved
   * change here is real and persisted, but won't take effect until the
   * app restarts. Surfaced in the UI rather than silently ignored. */
  restartRequired?: boolean;
  placeholder?: string;
  /** Only shown when at least one of these (setting, value) pairs
   * matches that setting's current live value (OR semantics) — hidden
   * otherwise. All providers stay fully configurable via env vars/API
   * regardless; this only trims what's *displayed*, so picking a
   * provider doesn't mean hunting through everyone else's fields too.
   * A field can depend on more than one selector — e.g. GEMINI_API_KEY
   * is shared between TTS and AI, so it should show if *either*
   * TTS_PROVIDER or AI_PROVIDER is "gemini." */
  showWhen?: { setting: string; value: string }[];
  /** For select-type settings that gate other fields' visibility — the
   * value in effect when nothing is set anywhere (DB or env), matching
   * the real runtime default (see getTtsProvider()/getLlmProvider()).
   * Lets the UI reflect the true default instead of an ambiguous blank
   * "Choose…" when nothing's been explicitly picked yet. */
  defaultValue?: string;
}

// The single source of truth for what's editable on /settings, and what
// each setting falls back to when no override is stored. Every env var
// this project reads for user-tunable behavior should have an entry here
// — see human-eyes.md for the "why a settings page" rationale.
export const SETTINGS: SettingDef[] = [
  {
    key: "AI_PROVIDER",
    label: "AI provider",
    group: "AI",
    type: "select",
    secret: false,
    options: [
      { value: "openwebui", label: "OpenWebUI / self-hosted Llama (default)" },
      { value: "ollama", label: "Ollama (direct, no Open WebUI needed)" },
      { value: "anthropic", label: "Anthropic Claude" },
      { value: "openai", label: "OpenAI (ChatGPT)" },
      { value: "xai", label: "xAI (Grok)" },
      { value: "gemini", label: "Google Gemini" },
    ],
    defaultValue: "openwebui",
    helpText:
      "OpenWebUI is the default — no paid API key required. Both it and Anthropic are verified end-to-end against real episodes (see human-eyes.md); the others need their own key/config below.",
  },
  {
    key: "ANTHROPIC_API_KEY",
    label: "Anthropic API key",
    group: "Anthropic",
    type: "password",
    secret: true,
    helpText:
      "Required for real narration — get one at console.anthropic.com. Without it, episodes use a plain template (no clustering, no real writing).",
    placeholder: "sk-ant-…",
    showWhen: [{ setting: "AI_PROVIDER", value: "anthropic" }],
  },
  {
    key: "ANTHROPIC_SUMMARY_MODEL",
    label: "Per-item summary model",
    group: "Anthropic",
    type: "text",
    secret: false,
    helpText: "Cheap/bulk model used once per item. Default: claude-haiku-4-5",
    placeholder: "claude-haiku-4-5",
    showWhen: [{ setting: "AI_PROVIDER", value: "anthropic" }],
  },
  {
    key: "ANTHROPIC_SCRIPT_MODEL",
    label: "Script-writing model",
    group: "Anthropic",
    type: "text",
    secret: false,
    helpText: "Higher-quality model used once per night for the actual narration. Default: claude-opus-5",
    placeholder: "claude-opus-5",
    showWhen: [{ setting: "AI_PROVIDER", value: "anthropic" }],
  },
  {
    key: "OPENAI_API_KEY",
    label: "OpenAI API key",
    group: "OpenAI",
    type: "password",
    secret: true,
    showWhen: [{ setting: "AI_PROVIDER", value: "openai" }],
  },
  {
    key: "OPENAI_MODEL",
    label: "OpenAI model",
    group: "OpenAI",
    type: "text",
    secret: false,
    placeholder: "gpt-6-astra",
    helpText: "Used for both per-item summaries and script-writing (one model, unlike Anthropic's two-tier setup).",
    showWhen: [{ setting: "AI_PROVIDER", value: "openai" }],
  },
  {
    key: "XAI_API_KEY",
    label: "xAI API key",
    group: "xAI (Grok)",
    type: "password",
    secret: true,
    showWhen: [{ setting: "AI_PROVIDER", value: "xai" }],
  },
  {
    key: "XAI_MODEL",
    label: "xAI model",
    group: "xAI (Grok)",
    type: "text",
    secret: false,
    placeholder: "grok-4.7",
    showWhen: [{ setting: "AI_PROVIDER", value: "xai" }],
  },
  {
    key: "GEMINI_LLM_MODEL",
    label: "Gemini model (text)",
    group: "Gemini AI",
    type: "text",
    secret: false,
    placeholder: "gemini-3.8-flash",
    helpText: "Uses the same GEMINI_API_KEY as Gemini TTS, if that's also configured — see the Gemini section below.",
    showWhen: [{ setting: "AI_PROVIDER", value: "gemini" }],
  },
  {
    key: "OPENWEBUI_BASE_URL",
    label: "Open WebUI base URL",
    group: "OpenWebUI / Llama",
    type: "text",
    secret: false,
    placeholder: "http://192.168.1.50:3000/api",
    helpText: "Your own Open WebUI instance's API base URL (self-hosted, so there's no universal default).",
    showWhen: [{ setting: "AI_PROVIDER", value: "openwebui" }],
  },
  {
    key: "OPENWEBUI_API_KEY",
    label: "Open WebUI API key",
    group: "OpenWebUI / Llama",
    type: "password",
    secret: true,
    helpText: "Optional — many local Open WebUI setups run without auth on a trusted LAN.",
    showWhen: [{ setting: "AI_PROVIDER", value: "openwebui" }],
  },
  {
    key: "OPENWEBUI_MODEL",
    label: "Open WebUI model",
    group: "OpenWebUI / Llama",
    type: "text",
    secret: false,
    placeholder: "llama3.3",
    helpText: "The model name exactly as loaded in your Open WebUI instance.",
    showWhen: [{ setting: "AI_PROVIDER", value: "openwebui" }],
  },
  {
    key: "OLLAMA_BASE_URL",
    label: "Ollama base URL",
    group: "Ollama",
    type: "text",
    secret: false,
    placeholder: "http://192.168.1.50:11434/v1",
    helpText:
      "Ollama's own OpenAI-compatible endpoint — no Open WebUI needed. Not localhost: this app runs in Docker, so point it at your Mac's actual LAN address.",
    showWhen: [{ setting: "AI_PROVIDER", value: "ollama" }],
  },
  {
    key: "OLLAMA_API_KEY",
    label: "Ollama API key",
    group: "Ollama",
    type: "password",
    secret: true,
    helpText: "Optional — Ollama has no auth by default. Only needed if you've put it behind a reverse proxy that adds one.",
    showWhen: [{ setting: "AI_PROVIDER", value: "ollama" }],
  },
  {
    key: "OLLAMA_MODEL",
    label: "Ollama model",
    group: "Ollama",
    type: "text",
    secret: false,
    placeholder: "qwen3:8b",
    helpText: "The model name exactly as pulled (ollama pull <name>).",
    showWhen: [{ setting: "AI_PROVIDER", value: "ollama" }],
  },
  {
    key: "OLLAMA_NUM_CTX",
    label: "Context window (tokens)",
    group: "Ollama",
    type: "text",
    secret: false,
    placeholder: "16384",
    helpText:
      "Ollama's OpenAI-compatible endpoint silently truncates to 4096 tokens otherwise, dropping the oldest part of the prompt with no error — easy to never notice. Defaults to 16384 here (script-writing sends a full day's article text as grounding, which can exceed Ollama's own default). Raise it if your model/hardware can handle more.",
    showWhen: [{ setting: "AI_PROVIDER", value: "ollama" }],
  },
  {
    key: "EPISODE_SCRIPT_PROMPT_DAILY",
    label: "Daily episode script prompt",
    group: "Prompts",
    type: "textarea",
    secret: false,
    defaultValue: DEFAULT_DAILY_SCRIPT_PROMPT,
    helpText:
      "The instructions given to the AI for writing each night's script, regardless of which AI provider is selected above. Replaces the built-in prompt entirely when saved, not just appended to it. Use {{maxWords}} and {{maxMinutes}} as placeholders — they're filled in automatically each time this runs (currently 45 minutes/~6750 words for daily episodes).",
  },
  {
    key: "EPISODE_SCRIPT_PROMPT_WEEKLY",
    label: "Weekly deep-dive script prompt",
    group: "Prompts",
    type: "textarea",
    secret: false,
    defaultValue: DEFAULT_WEEKLY_SCRIPT_PROMPT,
    helpText:
      "Same as the daily prompt above, but for Saturday's deep-dive episode (90 minutes/~13500 words) built from starred items. Same {{maxWords}}/{{maxMinutes}} placeholders apply.",
  },
  {
    key: "EPISODE_SUMMARY_PROMPT",
    label: "Episode summary prompt",
    group: "Prompts",
    type: "textarea",
    secret: false,
    defaultValue: DEFAULT_EPISODE_SUMMARY_PROMPT,
    helpText:
      "The instructions for writing the short teaser summary shown next to each episode (in the web UI and the podcast feed's description field). No placeholders — the full episode script is passed in automatically as context.",
  },
  {
    key: "TTS_PROVIDER",
    label: "Voice provider",
    group: "Text-to-Speech",
    type: "select",
    secret: false,
    options: [
      { value: "kokoro", label: "Kokoro-82M (local, self-hosted, default)" },
      { value: "kokoro-remote", label: "Kokoro-82M (remote server)" },
      { value: "elevenlabs", label: "ElevenLabs" },
      { value: "azure", label: "Azure AI Speech" },
      { value: "google", label: "Google Cloud TTS" },
      { value: "gemini", label: "Gemini TTS" },
      { value: "say", label: "macOS say (macOS only)" },
    ],
    defaultValue: "kokoro",
    helpText: "Kokoro needs no key and runs locally. The others need their own key below.",
  },
  {
    key: "KOKORO_VOICE",
    label: "Kokoro voice",
    group: "Text-to-Speech",
    type: "text",
    secret: false,
    helpText: "Default: af_heart (top-graded voice). See the model card on Hugging Face for the full list of 28.",
    placeholder: "af_heart",
    showWhen: [{ setting: "TTS_PROVIDER", value: "kokoro" }],
  },
  {
    key: "KOKORO_REMOTE_BASE_URL",
    label: "Remote Kokoro base URL",
    group: "Kokoro (remote)",
    type: "text",
    secret: false,
    placeholder: "http://192.168.1.50:8880/v1",
    helpText:
      "Any server speaking the OpenAI TTS API shape (POST /v1/audio/speech) works — e.g. Kokoro-FastAPI (github.com/remsky/Kokoro-FastAPI, runs anywhere) or mlx-audio (github.com/Blaizzy/mlx-audio, uses Apple's MLX framework for real Metal acceleration — the one you want on a Mac for an actual speed win over local CPU ONNX). Not localhost if this app runs in Docker — use the real LAN address of whatever machine is running it.",
    showWhen: [{ setting: "TTS_PROVIDER", value: "kokoro-remote" }],
  },
  {
    key: "KOKORO_REMOTE_API_KEY",
    label: "Remote Kokoro API key",
    group: "Kokoro (remote)",
    type: "password",
    secret: true,
    helpText: "Optional — most self-hosted Kokoro servers don't require auth by default.",
    showWhen: [{ setting: "TTS_PROVIDER", value: "kokoro-remote" }],
  },
  {
    key: "KOKORO_REMOTE_VOICE",
    label: "Remote Kokoro voice",
    group: "Kokoro (remote)",
    type: "text",
    secret: false,
    placeholder: "af_heart",
    helpText: "Default: af_heart, same default voice as the local provider.",
    showWhen: [{ setting: "TTS_PROVIDER", value: "kokoro-remote" }],
  },
  {
    key: "KOKORO_REMOTE_MODEL",
    label: "Remote Kokoro model name",
    group: "Kokoro (remote)",
    type: "text",
    secret: false,
    placeholder: "kokoro",
    helpText: "The model identifier your server expects in the request body — \"kokoro\" works for Kokoro-FastAPI's own examples.",
    showWhen: [{ setting: "TTS_PROVIDER", value: "kokoro-remote" }],
  },
  {
    key: "ELEVENLABS_API_KEY",
    label: "ElevenLabs API key",
    group: "ElevenLabs",
    type: "password",
    secret: true,
    showWhen: [{ setting: "TTS_PROVIDER", value: "elevenlabs" }],
  },
  {
    key: "ELEVENLABS_VOICE_ID",
    label: "ElevenLabs voice ID",
    group: "ElevenLabs",
    type: "text",
    secret: false,
    helpText: "From your ElevenLabs account's Voice Library.",
    showWhen: [{ setting: "TTS_PROVIDER", value: "elevenlabs" }],
  },
  {
    key: "ELEVENLABS_MODEL_ID",
    label: "ElevenLabs model ID",
    group: "ElevenLabs",
    type: "text",
    secret: false,
    placeholder: "eleven_multilingual_v2",
    showWhen: [{ setting: "TTS_PROVIDER", value: "elevenlabs" }],
  },
  {
    key: "AZURE_SPEECH_KEY",
    label: "Azure Speech key",
    group: "Azure AI Speech",
    type: "password",
    secret: true,
    showWhen: [{ setting: "TTS_PROVIDER", value: "azure" }],
  },
  {
    key: "AZURE_SPEECH_REGION",
    label: "Azure region",
    group: "Azure AI Speech",
    type: "text",
    secret: false,
    placeholder: "eastus",
    showWhen: [{ setting: "TTS_PROVIDER", value: "azure" }],
  },
  {
    key: "AZURE_SPEECH_VOICE",
    label: "Azure voice",
    group: "Azure AI Speech",
    type: "text",
    secret: false,
    placeholder: "en-US-JennyNeural",
    showWhen: [{ setting: "TTS_PROVIDER", value: "azure" }],
  },
  {
    key: "AZURE_SPEECH_LANGUAGE",
    label: "Azure language",
    group: "Azure AI Speech",
    type: "text",
    secret: false,
    placeholder: "en-US",
    showWhen: [{ setting: "TTS_PROVIDER", value: "azure" }],
  },
  {
    key: "GOOGLE_APPLICATION_CREDENTIALS",
    label: "Service account JSON path",
    group: "Google Cloud TTS",
    type: "text",
    secret: false,
    helpText:
      "A filesystem path inside the container to a GCP service account key — needs the file to actually exist on disk; this field just points at it, it can't upload one.",
    showWhen: [{ setting: "TTS_PROVIDER", value: "google" }],
  },
  {
    key: "GOOGLE_TTS_VOICE",
    label: "Google voice",
    group: "Google Cloud TTS",
    type: "text",
    secret: false,
    placeholder: "en-US-Chirp3-HD-Charon",
    showWhen: [{ setting: "TTS_PROVIDER", value: "google" }],
  },
  {
    key: "GOOGLE_TTS_LANGUAGE",
    label: "Google language",
    group: "Google Cloud TTS",
    type: "text",
    secret: false,
    placeholder: "en-US",
    showWhen: [{ setting: "TTS_PROVIDER", value: "google" }],
  },
  {
    key: "GEMINI_API_KEY",
    label: "Gemini API key",
    group: "Gemini",
    type: "password",
    secret: true,
    helpText: "Shared between Gemini TTS and Gemini AI below — one key authenticates both.",
    // Shown if EITHER Gemini usage is selected — one credential, don't
    // make the user paste it twice into two different provider sections.
    showWhen: [
      { setting: "TTS_PROVIDER", value: "gemini" },
      { setting: "AI_PROVIDER", value: "gemini" },
    ],
  },
  {
    key: "GEMINI_TTS_VOICE",
    label: "Gemini voice",
    group: "Gemini Voice",
    type: "text",
    secret: false,
    placeholder: "Kore",
    showWhen: [{ setting: "TTS_PROVIDER", value: "gemini" }],
  },
  {
    key: "GEMINI_TTS_MODEL",
    label: "Gemini model (voice)",
    group: "Gemini Voice",
    type: "text",
    secret: false,
    placeholder: "gemini-3.1-flash-tts",
    showWhen: [{ setting: "TTS_PROVIDER", value: "gemini" }],
  },
  {
    key: "SAY_VOICE",
    label: "macOS say voice",
    group: "macOS say",
    type: "text",
    secret: false,
    helpText: "Run `say -v ?` on the host to list installed voices.",
    showWhen: [{ setting: "TTS_PROVIDER", value: "say" }],
  },
  {
    key: "ENABLE_SCHEDULER",
    label: "Nightly auto-generation",
    group: "Scheduling",
    type: "select",
    secret: false,
    options: [
      { value: "true", label: "Enabled" },
      { value: "false", label: "Disabled" },
    ],
    restartRequired: true,
    helpText: "Registered once at server startup — toggling this needs a restart to take effect.",
  },
  {
    key: "NIGHTLY_CRON",
    label: "Nightly schedule (cron expression)",
    group: "Scheduling",
    type: "text",
    secret: false,
    restartRequired: true,
    helpText: "Default: 0 21 * * * (9pm, local time). Needs a restart to take effect.",
    placeholder: "0 21 * * *",
  },
  {
    key: "EPISODE_RETENTION_DAYS",
    label: "Auto-delete episodes after (days)",
    group: "Scheduling",
    type: "text",
    secret: false,
    helpText:
      "Episodes (and their audio files) older than this are deleted automatically every time generation runs. Default: 15. Set to 0 to disable.",
    placeholder: "15",
  },
  {
    key: "BASIC_AUTH_ENABLED",
    label: "Password-protect this site",
    group: "Security",
    type: "select",
    secret: false,
    options: [
      { value: "false", label: "Disabled (default)" },
      { value: "true", label: "Enabled" },
    ],
    defaultValue: "false",
    helpText:
      "Off by default — there's no login system otherwise, so if you expose this app directly to the public internet (vs. something like a Cloudflare Tunnel with its own auth in front), turn this on and set a username/password below. Takes effect immediately on the next request, no restart needed. Applies to the whole app, including the podcast feed/audio — most podcast apps support embedding credentials in the feed URL itself (https://user:pass@yourhost/feed.xml). See docs/security.md.",
  },
  {
    key: "BASIC_AUTH_USERNAME",
    label: "Username",
    group: "Security",
    type: "text",
    secret: false,
    placeholder: "admin",
    helpText: "Required for password protection to actually work once enabled above.",
    showWhen: [{ setting: "BASIC_AUTH_ENABLED", value: "true" }],
  },
  {
    key: "BASIC_AUTH_PASSWORD",
    label: "Password",
    group: "Security",
    type: "password",
    secret: true,
    placeholder: "",
    helpText:
      "Required for password protection to actually work once enabled above. Stored encrypted at rest if SETTINGS_ENCRYPTION_KEY is set in your environment — see docs/security.md.",
    showWhen: [{ setting: "BASIC_AUTH_ENABLED", value: "true" }],
  },
];

const SETTINGS_BY_KEY = new Map(SETTINGS.map((s) => [s.key, s]));

/**
 * Effective value for `key`: a saved override from the database if one
 * exists, otherwise the matching env var, otherwise undefined. This is
 * the one function every call site that used to read `process.env.X`
 * directly for a user-tunable value should go through instead, so a
 * change saved on /settings takes effect on the very next read — no
 * caching, no restart (except for the two settings explicitly flagged
 * `restartRequired`, which are only ever read once at server startup).
 */
export async function getSetting(key: string): Promise<string | undefined> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (row && row.value !== "") {
    if (!SETTINGS_BY_KEY.get(key)?.secret) return row.value;
    try {
      return decryptSettingValue(row.value);
    } catch (e) {
      // Wrong/missing SETTINGS_ENCRYPTION_KEY, or corrupted data — treat
      // as "not configured" rather than crashing whatever called this
      // (an episode generation, a page load). Logged loudly since this
      // is a real problem the person running this needs to notice, not
      // a normal "setting just isn't set" case.
      console.error(`[settings] Couldn't decrypt "${key}":`, e instanceof Error ? e.message : e);
      return undefined;
    }
  }
  return process.env[key] || undefined;
}

/**
 * Saves an override, or — if `value` is empty/whitespace-only — clears
 * any stored override so the setting falls back to its env var/default
 * again. Rejects unknown keys so this can't become an arbitrary
 * key/value store for anything other than the registered settings above.
 */
export async function setSetting(key: string, value: string): Promise<void> {
  const def = SETTINGS_BY_KEY.get(key);
  if (!def) {
    throw new Error(`Unknown setting "${key}"`);
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    await prisma.setting.deleteMany({ where: { key } });
    return;
  }
  const toStore = def.secret ? encryptSettingValue(trimmed) : trimmed;
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: toStore },
    update: { value: toStore },
  });
}

export type SettingStatus = SettingDef & {
  /** The actual current value — omitted for secrets, which only ever expose `hasValue`. */
  value?: string;
  hasValue: boolean;
  source: "database" | "environment" | "unset";
};

/** Full status of every registered setting, for rendering /settings. */
export async function getAllSettingStatuses(): Promise<SettingStatus[]> {
  const rows = await prisma.setting.findMany();
  const overrides = new Map(rows.map((r) => [r.key, r.value]));

  return SETTINGS.map((def) => {
    const dbValue = overrides.get(def.key);
    if (dbValue) {
      return { ...def, hasValue: true, source: "database", value: def.secret ? undefined : dbValue };
    }
    const envValue = process.env[def.key];
    if (envValue) {
      return { ...def, hasValue: true, source: "environment", value: def.secret ? undefined : envValue };
    }
    return { ...def, hasValue: false, source: "unset" };
  });
}
