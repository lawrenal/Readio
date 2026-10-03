import { describe, expect, it } from "vitest";
import { isCrossSiteWrite } from "./csrf";

function req(method: string, headers: Record<string, string> = {}) {
  return { method, headers: new Headers(headers) };
}

describe("isCrossSiteWrite", () => {
  it("never blocks safe methods, even cross-site", () => {
    expect(isCrossSiteWrite(req("GET", { "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isCrossSiteWrite(req("HEAD", { "sec-fetch-site": "cross-site" }))).toBe(false);
  });

  it("blocks cross-site and same-site writes via Fetch Metadata", () => {
    expect(isCrossSiteWrite(req("POST", { "sec-fetch-site": "cross-site" }))).toBe(true);
    // e.g. another app on a different localhost port
    expect(isCrossSiteWrite(req("POST", { "sec-fetch-site": "same-site" }))).toBe(true);
  });

  it("allows same-origin and user-initiated writes", () => {
    expect(isCrossSiteWrite(req("POST", { "sec-fetch-site": "same-origin" }))).toBe(false);
    expect(isCrossSiteWrite(req("POST", { "sec-fetch-site": "none" }))).toBe(false);
  });

  it("allows non-browser clients that send no Origin or Fetch Metadata (curl, nightly.sh)", () => {
    expect(isCrossSiteWrite(req("POST"))).toBe(false);
  });

  it("allows the browser extension's origin", () => {
    expect(
      isCrossSiteWrite(req("POST", { origin: "chrome-extension://abcdef", "sec-fetch-site": "cross-site" })),
    ).toBe(false);
    expect(isCrossSiteWrite(req("POST", { origin: "moz-extension://abcdef" }))).toBe(false);
  });

  it("falls back to comparing Origin against Host without Fetch Metadata", () => {
    expect(isCrossSiteWrite(req("POST", { origin: "http://192.168.1.50:3000", host: "192.168.1.50:3000" }))).toBe(
      false,
    );
    expect(isCrossSiteWrite(req("POST", { origin: "https://evil.example", host: "192.168.1.50:3000" }))).toBe(true);
    expect(
      isCrossSiteWrite(
        req("POST", { origin: "https://readio.example.com", host: "localhost:3000", "x-forwarded-host": "readio.example.com" }),
      ),
    ).toBe(false);
  });

  it("blocks opaque and malformed origins", () => {
    expect(isCrossSiteWrite(req("POST", { origin: "null", host: "localhost:3000" }))).toBe(true);
    expect(isCrossSiteWrite(req("POST", { origin: "not a url", host: "localhost:3000" }))).toBe(true);
  });
});
