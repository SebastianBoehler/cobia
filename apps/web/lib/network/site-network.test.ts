import { describe, expect, it } from "vitest";
import { networkAllowsPath, resolveSiteNetwork } from "./site-network";

describe("site network boundary", () => {
  it("binds only the exact testnet hostname to chain 1952", () => {
    expect(resolveSiteNetwork("testnet.getcobia.com")).toMatchObject({
      mode: "testnet",
      chainId: 1952,
      name: "X Layer Testnet",
    });
    expect(() => resolveSiteNetwork("testnet.getcobia.com.evil.example")).toThrow(
      "Unrecognized Cobia host",
    );
    expect(() => resolveSiteNetwork("testnet2.getcobia.com")).toThrow(
      "Unrecognized Cobia host",
    );
  });

  it("keeps production and local development on chain 196", () => {
    for (const host of ["getcobia.com", "www.getcobia.com", "cobia-web.vercel.app", "localhost:3000"]) {
      expect(resolveSiteNetwork(host)).toMatchObject({ mode: "mainnet", chainId: 196 });
    }
  });

  it("provides an explicit local testnet hostname for browser verification", () => {
    expect(resolveSiteNetwork("testnet.localhost:3000")).toMatchObject({ mode: "testnet", chainId: 1952 });
  });

  it("permits a configured Vercel deployment host without accepting arbitrary hosts", () => {
    expect(resolveSiteNetwork("cobia-git-main-team.vercel.app", {
      VERCEL_URL: "cobia-git-main-team.vercel.app",
    }).chainId).toBe(196);
    expect(() => resolveSiteNetwork("other-project.vercel.app")).toThrow(
      "Unrecognized Cobia host",
    );
  });

  it("allows only the public rehearsal surface on testnet", () => {
    for (const path of [
      "/",
      "/portfolio",
      "/terms",
      "/api/network/status",
      "/_vercel/speed-insights/script.js",
      "/api/wallets/0x1111111111111111111111111111111111111111/portfolio",
    ]) expect(networkAllowsPath("testnet", path)).toBe(true);

    for (const path of [
      "/intents/new",
      "/discover",
      "/activity",
      "/api/intents",
      "/api/programs/550e8400-e29b-41d4-a716-446655440000/execution",
      "/api/internal/coding-agent/rpc/job",
    ]) expect(networkAllowsPath("testnet", path)).toBe(false);
  });
});
