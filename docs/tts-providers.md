# Text-to-speech providers

Selected via `TTS_PROVIDER` (editable on `/settings`, or set as an env
var). Seven providers are supported, behind one `TtsProvider` interface
(`src/lib/tts.ts`).

| Provider | `TTS_PROVIDER` value | Needs | Verified with real audio? |
|---|---|---|---|
| Kokoro-82M, local (default) | `kokoro` | Nothing | Yes |
| Kokoro-82M, remote server | `kokoro-remote` | A Kokoro-FastAPI or mlx-audio instance elsewhere | Yes |
| ElevenLabs | `elevenlabs` | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | No |
| Azure AI Speech | `azure` | `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` | No |
| Google Cloud TTS | `google` | `GOOGLE_APPLICATION_CREDENTIALS` | No |
| Gemini TTS | `gemini` | `GEMINI_API_KEY` | No |
| macOS `say` | `say` | macOS only, not available in Docker | Yes (native-mac path) |

## Kokoro-82M, local (the default)

Runs fully in-process via `kokoro-js` + `onnxruntime-node` — no API key,
zero ongoing cost. The model (~90MB) downloads itself on first use.

```
TTS_PROVIDER=kokoro
KOKORO_VOICE=af_heart   # optional, default shown — see the Hugging Face model card for the full list of 28
```

Synthesis speed depends entirely on the CPU it's running on. On modest
hardware (an older Mac Mini, a budget home-lab box), Kokoro can end up
being the slowest single step in generating an episode — a real episode
on an i5 home-lab box took ~73 of ~78 total minutes just in Kokoro
synthesis. If that's a bottleneck for you, see **remote Kokoro** below.

## Kokoro-82M, remote server

Offloads synthesis to a faster machine over HTTP instead of running it
in-process wherever Readio itself is hosted.

```
TTS_PROVIDER=kokoro-remote
KOKORO_REMOTE_BASE_URL=http://<your-server>:8880/v1
KOKORO_REMOTE_API_KEY=     # optional — most self-hosted Kokoro servers don't require auth
KOKORO_REMOTE_VOICE=af_heart   # optional
KOKORO_REMOTE_MODEL=kokoro     # optional — the model identifier your server expects
```

Any server speaking the OpenAI TTS API shape (`POST /v1/audio/speech`)
works. Two real options:

- **[mlx-audio](https://github.com/Blaizzy/mlx-audio)** — built on Apple's
  MLX framework, real Metal acceleration on Apple Silicon. This is the
  one you actually want on a Mac — it's a genuine speed win, not just
  moving the same slow CPU work to a different machine. Full setup walkthrough,
  including every real snag hit getting it running: [remote-kokoro-setup.md](./remote-kokoro-setup.md).
- **[Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI)** —
  Dockerized, runs anywhere (CPU/AMD/NVIDIA). Simpler to deploy, but its
  CPU mode on, say, an old Mac Mini won't necessarily beat what's already
  running locally — the speed win is specifically about *better
  hardware*, not *a different machine*.

## ElevenLabs

```
TTS_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...        # from your ElevenLabs account's Voice Library
ELEVENLABS_MODEL_ID=eleven_multilingual_v2   # optional, default shown
```

Get a key at [elevenlabs.io/app/settings/api-keys](https://elevenlabs.io/app/settings/api-keys).

## Azure AI Speech

```
TTS_PROVIDER=azure
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=eastus              # optional, default shown
AZURE_SPEECH_VOICE=en-US-JennyNeural    # optional, default shown
AZURE_SPEECH_LANGUAGE=en-US             # optional, default shown
```

Create a "Speech" resource in the [Azure Portal](https://portal.azure.com)
to get a key + region — the simplest cloud option to set up (one key, one
region string, no OAuth). Full voice list via
`GET https://{region}.tts.speech.microsoft.com/cognitiveservices/voices/list`.

## Google Cloud TTS

```
TTS_PROVIDER=google
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
GOOGLE_TTS_VOICE=en-US-Chirp3-HD-Charon   # optional, default shown
GOOGLE_TTS_LANGUAGE=en-US                 # optional, default shown
```

Heavier setup than the others: create a GCP project, enable the
Text-to-Speech API, create a service account with that access, download
its JSON key, and make sure the path above actually exists inside the
container (this setting just points at the file, it doesn't upload one).

## Gemini TTS

```
TTS_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_TTS_VOICE=Kore                     # optional, default shown
GEMINI_TTS_MODEL=gemini-3.1-flash-tts     # optional, default shown
```

Get a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
`GEMINI_API_KEY` is shared with Gemini as an AI provider if you use both
(see [ai-providers.md](./ai-providers.md)) — set it once.

## macOS `say`

Native macOS only — shells out to the built-in `say` command, which
doesn't exist on Linux/Docker.

```
TTS_PROVIDER=say
SAY_VOICE=Samantha   # optional — run `say -v ?` to list installed voices
```
