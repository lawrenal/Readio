import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encryptSettingValue, decryptSettingValue } from "./settings-crypto";

const ORIGINAL_KEY = process.env.SETTINGS_ENCRYPTION_KEY;

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.SETTINGS_ENCRYPTION_KEY;
  else process.env.SETTINGS_ENCRYPTION_KEY = ORIGINAL_KEY;
});

describe("settings-crypto", () => {
  describe("without SETTINGS_ENCRYPTION_KEY set", () => {
    beforeEach(() => {
      delete process.env.SETTINGS_ENCRYPTION_KEY;
    });

    it("passes values through unchanged (plaintext fallback)", () => {
      expect(encryptSettingValue("sk-ant-abc123")).toBe("sk-ant-abc123");
    });

    it("decrypt is a no-op for non-encrypted values", () => {
      expect(decryptSettingValue("sk-ant-abc123")).toBe("sk-ant-abc123");
    });
  });

  describe("with SETTINGS_ENCRYPTION_KEY set", () => {
    beforeEach(() => {
      process.env.SETTINGS_ENCRYPTION_KEY = "test-key-do-not-use-in-prod";
    });

    it("round-trips a value through encrypt then decrypt", () => {
      const plaintext = "sk-ant-super-secret-key-value";
      const encrypted = encryptSettingValue(plaintext);
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted.startsWith("enc:v1:")).toBe(true);
      expect(decryptSettingValue(encrypted)).toBe(plaintext);
    });

    it("produces different ciphertext each time (random IV)", () => {
      const plaintext = "same-value-both-times";
      const a = encryptSettingValue(plaintext);
      const b = encryptSettingValue(plaintext);
      expect(a).not.toBe(b);
      expect(decryptSettingValue(a)).toBe(plaintext);
      expect(decryptSettingValue(b)).toBe(plaintext);
    });

    it("still passes through legacy plaintext values unchanged (backward compat)", () => {
      // A value saved before encryption was added, or while the key was
      // unset — getSetting() must keep reading these correctly.
      expect(decryptSettingValue("sk-ant-legacy-plaintext-value")).toBe("sk-ant-legacy-plaintext-value");
    });

    it("throws if the key changes after encryption (can't silently return garbage)", () => {
      const encrypted = encryptSettingValue("some-secret");
      process.env.SETTINGS_ENCRYPTION_KEY = "a-different-key-entirely";
      expect(() => decryptSettingValue(encrypted)).toThrow();
    });
  });
});
