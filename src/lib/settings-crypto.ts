import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// Encrypts secret-type setting values (API keys, the basic-auth password)
// at rest, so a leaked SQLite file alone (a backup, a misconfigured bind
// mount) isn't enough to recover them — the key has to come from
// SETTINGS_ENCRYPTION_KEY, a plain env var that deliberately lives
// outside the database. Optional, not required: if it's unset, this
// behaves exactly as before (plaintext), so existing deployments aren't
// forced into anything. AES-256-GCM — authenticated encryption, so a
// tampered or merely-different-looking value fails to decrypt cleanly
// rather than silently producing garbage.
//
// Backward/forward compatible by construction: encrypted values are
// prefixed with ENC_PREFIX, so getSetting() can tell "this is ciphertext,
// decrypt it" apart from "this is a legacy plaintext value, return as
//-is" without needing a schema migration or a flag day. A value saved
// before SETTINGS_ENCRYPTION_KEY was set (or saved while it was unset)
// just keeps working, unencrypted, until it's re-saved.
const ENC_PREFIX = "enc:v1:";

function getKey(): Buffer | null {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!raw) return null;
  // scrypt rather than using the raw string directly — tolerates any
  // passphrase length/shape the user picks, rather than demanding an
  // exact 32-byte hex/base64 value. Salt is fixed (not random) since this
  // derives a stable key from one secret, not per-value hashing.
  return scryptSync(raw, "readio-settings", 32);
}

export function encryptSettingValue(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext;

  const iv = randomBytes(12); // 96-bit nonce, standard for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return ENC_PREFIX + Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/**
 * Decrypts a value saved by encryptSettingValue. Returns the input
 * unchanged if it isn't in encrypted form at all (legacy plaintext — see
 * the module doc comment above) or if SETTINGS_ENCRYPTION_KEY isn't set.
 * Throws only if the value IS marked as encrypted but fails to decrypt
 * (wrong/missing key, or corrupted data) — callers should treat that as
 * "this secret is unrecoverable right now," not silently return garbage.
 */
export function decryptSettingValue(stored: string): string {
  if (!stored.startsWith(ENC_PREFIX)) return stored;

  const key = getKey();
  if (!key) {
    throw new Error(
      "This value is encrypted but SETTINGS_ENCRYPTION_KEY isn't set — can't decrypt it. " +
        "Set the same key used to encrypt it, or re-save this setting (which will store it " +
        "in plaintext instead, same as before encryption was added).",
    );
  }

  const raw = Buffer.from(stored.slice(ENC_PREFIX.length), "base64");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
