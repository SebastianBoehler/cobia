import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("Next deployment headers", () => {
  it("denies framing and browser capabilities on every product route", async () => {
    expect(nextConfig.poweredByHeader).toBe(false);
    const entries = await nextConfig.headers?.();
    expect(entries).toHaveLength(1);
    expect(entries?.[0]?.source).toBe("/(.*)");
    expect(Object.fromEntries(entries?.[0]?.headers.map(({ key, value }) => [key, value]) ?? []))
      .toMatchObject({
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      });
  });
});
