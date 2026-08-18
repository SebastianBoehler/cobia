import { describe, expect, it } from "vitest";
import { assertPublicCommerceUrlV1, isPublicIpV1 } from "./network-policy";

describe("commerce discovery network policy", () => {
  it("accepts only HTTPS on port 443 with public DNS answers", () => {
    expect(assertPublicCommerceUrlV1("https://api.cdp.coinbase.com/path", ["104.18.34.226"]).hostname)
      .toBe("api.cdp.coinbase.com");
  });

  it("rejects schemes, credentials, ports, and local hostnames", () => {
    for (const url of [
      "http://example.com",
      "https://user:pass@example.com",
      "https://example.com:444/path",
      "https://localhost/path",
      "https://service.local/path",
      "https://metadata.google.internal/path",
    ]) {
      expect(() => assertPublicCommerceUrlV1(url, ["104.18.34.226"])).toThrow();
    }
  });

  it("rejects private, link-local, documentation, multicast, and encoded loopback IPs", () => {
    for (const ip of [
      "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254",
      "172.16.0.1", "192.168.0.1", "192.0.2.1", "198.18.0.1", "198.51.100.1",
      "203.0.113.1", "224.0.0.1", "255.255.255.255", "::", "::1", "fc00::1",
      "fe80::1", "ff02::1", "2001:db8::1", "::ffff:127.0.0.1",
    ]) {
      expect(isPublicIpV1(ip), ip).toBe(false);
    }
    expect(() => assertPublicCommerceUrlV1("https://2130706433/path", ["127.0.0.1"]))
      .toThrow();
  });

  it("fails closed for empty or mixed DNS answers", () => {
    expect(() => assertPublicCommerceUrlV1("https://example.com", [])).toThrow(/DNS/i);
    expect(() => assertPublicCommerceUrlV1("https://example.com", ["104.18.34.226", "127.0.0.1"]))
      .toThrow(/blocked/i);
  });
});
