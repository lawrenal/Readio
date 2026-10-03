# Security

Readio is a single-user, local-config tool with **no built-in login or
session system** — the trust boundary is "whoever can reach this app at
all." Two things exist to help once you're hosting it somewhere more
exposed than your own LAN: an optional password gate, and encryption for
the API keys/secrets stored in its database.

## Password-protecting a public deployment

If you expose Readio directly to the public internet, **and** nothing
else in front of it already handles authentication (no Cloudflare Tunnel
access policy, no reverse-proxy auth, no VPN-only access), turn on
password protection: `/settings` → **Security** → "Password-protect this
site."

```
BASIC_AUTH_ENABLED=true
BASIC_AUTH_USERNAME=admin
BASIC_AUTH_PASSWORD=choose-a-real-password
```

This is **off by default** — if you're already behind something that
handles access control (e.g. a Cloudflare Tunnel with its own identity
policy), there's no need to turn it on; it'd just be a redundant second
login.

When enabled, it gates the *entire app* — the web UI, `/settings`, and
the podcast feed/audio. It takes effect immediately on the next request,
no restart needed, and it's implemented as standard HTTP Basic Auth, so:

- **Browsers** get the native username/password prompt.
- **Podcast apps** subscribing to the feed: most support embedding
  credentials directly in the URL —
  `https://admin:choose-a-real-password@yourhost/feed.xml` — which
  sends the same credentials automatically, no interactive prompt needed.
- **`curl`/scripts**: use `-u username:password`, or the same
  URL-embedded form above.

### Fail-closed behavior

If `BASIC_AUTH_ENABLED` is `true` but the username/password haven't
actually been set (e.g. you toggled it on without filling in the other
two fields), **every request gets rejected**, including your own access
to `/settings` — it does not quietly let everyone through just because
it's half-configured. In the normal flow this doesn't come up: the
toggle and the two credential fields are all part of the same form, saved
together in one click.

### If you lock yourself out

There's no recovery UI, by design — if there were, it'd be a way around
the password gate. Disable it directly in the SQLite database instead.
From the host (or inside the container):

```bash
sqlite3 /path/to/dev.db "UPDATE Setting SET value = 'false' WHERE key = 'BASIC_AUTH_ENABLED';"
```

(Adjust the path to wherever your `DATABASE_URL`/bind mount points — for
the Docker setup, that's the `dev.db` file under whatever host directory
you mounted to `/app/data`.)

## Encrypting API keys at rest

Every secret saved via `/settings` (API keys, the basic-auth password)
lives in the same SQLite file as everything else — the same trust
boundary a local `.env` file already sits in, not a new exposure on its
own. But by default it's stored in **plaintext**, which matters more once
other people are self-hosting this with their own real keys.

Set `SETTINGS_ENCRYPTION_KEY` (any string — it's run through a key
derivation function, not used raw) to turn on AES-256-GCM encryption for
every secret-type setting:

```
SETTINGS_ENCRYPTION_KEY=some-long-random-string-you-generate-once
```

A reasonable way to generate one:

```bash
openssl rand -base64 32
```

**This is optional and backward-compatible:**

- If unset, nothing changes — secrets are stored in plaintext exactly as
  before.
- If you set it on a deployment that already has secrets saved in
  plaintext, those keep working unchanged (read with a decrypt-then-
  fallback-to-plaintext check) — they just won't actually be encrypted
  until you re-save them (re-enter a key you already have on `/settings`
  and save; from then on it's stored encrypted).
- The key itself must live **outside** the database (an env var, not a
  `/settings` field) — that's the entire point. If it lived in the same
  SQLite file it's protecting, a leak of that file would compromise both
  equally.
- If you ever lose the key (or change it without re-saving affected
  secrets first), those specific secrets become unrecoverable — Readio
  treats them as "not configured" rather than crashing, and logs a clear
  error naming which setting failed to decrypt. Re-enter them.

## Reporting a real vulnerability

This is a small, single-maintainer self-hosted project, not a company
with a security team — if you find a real issue, opening a GitHub issue
describing it (without exploit details, if it's serious) is the right
way to flag it.
