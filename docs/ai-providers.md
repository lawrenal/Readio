# AI providers

Readio uses an AI provider for two things: a short summary generated once
per item as it's extracted, and the nightly/weekly pass that clusters
items and writes the actual episode script.

Selected via `AI_PROVIDER` (editable on `/settings`, or set as an env
var). Six providers are supported, behind one `LlmProvider` interface
(`src/lib/llm.ts`) — switching providers doesn't require any code
changes, just configuration.

| Provider | `AI_PROVIDER` value | Needs | Verified against a real episode? |
|---|---|---|---|
| Open WebUI (default) | `openwebui` | A running Open WebUI instance | Yes |
| Anthropic Claude | `anthropic` | `ANTHROPIC_API_KEY` | Yes |
| Ollama (direct) | `ollama` | A running Ollama instance | Shares the same HTTP client as Open WebUI, not separately verified on its own |
| OpenAI | `openai` | `OPENAI_API_KEY` | No — built against current docs, untested against a real key |
| xAI (Grok) | `xai` | `XAI_API_KEY` | No — same as above |
| Google Gemini | `gemini` | `GEMINI_API_KEY` | No — Gemini's `interactions` endpoint and `max_output_tokens` field are best-guesses against sparse docs |

Without a working AI provider configured, episodes fall back to a plain
template writer (every item read back in order, no real clustering) so
the rest of the pipeline — extraction, TTS, RSS — still works end to end
while you're setting things up. Every episode's `notes` field says
plainly when this happened.

## Open WebUI (the default)

[Open WebUI](https://github.com/open-webui/open-webui) is a self-hosted
chat UI that sits in front of local models (via Ollama or its own
backends) and exposes an OpenAI-compatible API — that API is what Readio
actually talks to.

```
AI_PROVIDER=openwebui
OPENWEBUI_BASE_URL=http://<your-openwebui-host>:3000/api
OPENWEBUI_API_KEY=       # optional — many local setups run without auth on a trusted LAN
OPENWEBUI_MODEL=llama3.3 # the model name exactly as loaded in your instance
```

If Readio is running in Docker, `OPENWEBUI_BASE_URL` needs to be reachable
*from inside the container* — `localhost` means the container itself, not
your host machine, so point it at your host's actual LAN IP or a Docker
network alias.

## Ollama (direct — no Open WebUI needed)

Skips Open WebUI entirely and talks to Ollama's own built-in
OpenAI-compatible endpoint.

```
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://<your-ollama-host>:11434/v1
OLLAMA_API_KEY=       # optional — Ollama has no auth by default
OLLAMA_MODEL=qwen3:8b # exactly as pulled (`ollama pull <name>`)
OLLAMA_NUM_CTX=16384  # see note below
```

**Important:** Ollama's OpenAI-compatible endpoint silently truncates the
prompt to 4096 tokens unless you raise the context window explicitly —
with no error, it just drops the oldest part of what you sent. Since
script-writing sends a full day's article text as grounding, this can
easily exceed Ollama's own default. `OLLAMA_NUM_CTX` defaults to 16384
here specifically to avoid that trap; raise it further if your
model/hardware can handle more.

## Anthropic Claude

```
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_SUMMARY_MODEL=claude-haiku-4-5  # optional, cheap/bulk model for per-item summaries
ANTHROPIC_SCRIPT_MODEL=claude-opus-5      # optional, higher-quality model for the actual script
```

Get a key at [console.anthropic.com](https://console.anthropic.com/).

## OpenAI, xAI

Both share the same Chat Completions client as Open WebUI/Ollama (that
wire format is near-universal).

```
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-6-astra   # optional
```

```
AI_PROVIDER=xai
XAI_API_KEY=xai-...
XAI_MODEL=grok-4.7    # optional
```

## Google Gemini

```
AI_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_LLM_MODEL=gemini-3.8-flash   # optional
```

Get a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
`GEMINI_API_KEY` is shared with Gemini TTS if you use both (see
[tts-providers.md](./tts-providers.md)) — set it once, it applies to
either.

## Editing the actual prompts

Which provider you pick only changes who answers the prompt — the prompt
itself (what the AI is instructed to do with your content) is fully
editable from `/settings` regardless of provider. See
[prompts.md](./prompts.md).
