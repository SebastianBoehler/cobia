import { describe, expect, it, vi } from "vitest";
import { assertAgentExecutorReadyV1 } from "./executor-preflight";

const executor = "0x1111111111111111111111111111111111111111" as const;
const owner = "0x2222222222222222222222222222222222222222" as const;
const token = "0x3333333333333333333333333333333333333333" as const;
const signer = "0x4444444444444444444444444444444444444444" as const;
const risk = "0x5555555555555555555555555555555555555555" as const;
const registry = "0x7777777777777777777777777777777777777777" as const;
const hash = `0x${"66".repeat(32)}` as const;

describe("agent executor live preflight", () => {
  it("requires exact code, chain, signer, wallet, token, and route capacity", async () => {
    const read = {
      getChainId: vi.fn(async () => 196), getCodeHash: vi.fn(async () => hash),
      riskManager: vi.fn(async () => risk), registry: vi.fn(async () => registry),
      paused: vi.fn(async () => false), registryPaused: vi.fn(async () => false),
      verifierSigner: vi.fn(async () => signer), walletAuthorized: vi.fn(async () => true),
      tokenEnabled: vi.fn(async () => true), maxRoute: vi.fn(async () => 100n),
    };
    await expect(assertAgentExecutorReadyV1({
      executor, expectedCodeHash: hash, expectedVerifier: signer,
      owner, inputToken: token, inputAmount: 10n, read,
    })).resolves.toBeUndefined();
    expect(read.riskManager).toHaveBeenCalledWith(executor);
    expect(read.registry).toHaveBeenCalledWith(executor);
  });

  it.each([
    ["chain", { getChainId: async () => 1952 }],
    ["paused", { paused: async () => true }],
    ["registry paused", { registryPaused: async () => true }],
    ["wallet", { walletAuthorized: async () => false }],
    ["token", { tokenEnabled: async () => false }],
    ["cap", { maxRoute: async () => 9n }],
  ])("rejects an invalid %s boundary", async (_label, override) => {
    const read = {
      getChainId: async () => 196, getCodeHash: async () => hash,
      riskManager: async () => risk, registry: async () => registry,
      paused: async () => false, registryPaused: async () => false,
      verifierSigner: async () => signer, walletAuthorized: async () => true,
      tokenEnabled: async () => true, maxRoute: async () => 100n,
      ...override,
    };
    await expect(assertAgentExecutorReadyV1({
      executor, expectedCodeHash: hash, expectedVerifier: signer,
      owner, inputToken: token, inputAmount: 10n, read,
    })).rejects.toThrow();
  });
});
