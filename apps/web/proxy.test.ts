import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

describe("hostname network proxy", () => {
  it("rejects mainnet-only APIs on the testnet host", async () => {
    const response = await proxy(new NextRequest("https://testnet.getcobia.com/api/requests", {
      method: "POST",
    }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: "NETWORK_UNAVAILABLE",
      message: "This product route is not available on X Layer Testnet.",
    });
  });

  it("redirects mainnet-only pages on the testnet host", async () => {
    const response = await proxy(new NextRequest("https://testnet.getcobia.com/markets"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://testnet.getcobia.com/");
  });

  it("rejects unrecognized hosts instead of guessing a chain", async () => {
    const response = await proxy(new NextRequest("https://testnet.getcobia.com.evil.example/"));

    expect(response.status).toBe(421);
  });

  it("does not let a forwarded-host header escape the testnet boundary", async () => {
    const response = await proxy(new NextRequest("https://testnet.getcobia.com/api/requests", {
      method: "POST",
      headers: { "x-forwarded-host": "getcobia.com" },
    }));

    expect(response.status).toBe(409);
  });

  it("gives public pages a short host-scoped CDN lifetime", () => {
    const response = proxy(new NextRequest("https://getcobia.com/discover"));

    expect(response.headers.get("vercel-cdn-cache-control"))
      .toBe("public, s-maxage=10, stale-while-revalidate=30");
  });
});
