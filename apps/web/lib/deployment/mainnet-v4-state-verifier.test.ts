import { describe, expect, it } from "vitest";
import type { MainnetV4StateReader, MainnetV4StateSpec } from "./mainnet-v4-state-verifier";
import { verifyMainnetV4State } from "./mainnet-v4-state-verifier";

const address = (byte: string) => `0x${byte.repeat(40)}` as `0x${string}`;
const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const spec: MainnetV4StateSpec = { chainId: 196, owner: address("1"), verifier: address("2"),
  registry: address("3"), riskManager: address("4"), executor: address("5"), canary: address("6"),
  activationAtSec: 2_000, openAccessAfterSec: 3_000,
  codeHashes: { riskManager: hash("7"), executor: hash("8") },
  permissions: [{ key: hash("9"), target: address("a"), runtimeCodeHash: hash("b") }],
};

function reader(mode: "proposed" | "canary" | "open", overrides: Record<string, unknown> = {}): MainnetV4StateReader {
  const values: Record<string, unknown> = { owner: spec.owner, verifierSigner: spec.verifier,
    executor: spec.executor, registry: spec.registry, riskManager: spec.riskManager,
    limits: { maxRouteUsdE8: 100_000_000_000n, maxWallet24hUsdE8: 500_000_000_000n,
      maxProtocol24hUsdE8: 5_000_000_000_000n },
    pendingLimits: { values: { maxRouteUsdE8: 0n, maxWallet24hUsdE8: 0n,
      maxProtocol24hUsdE8: 0n }, activateAfter: 0n },
    pendingVerifier: address("0"), verifierActivateAfter: 0n,
    paused: mode === "proposed", accessMode: mode === "open" ? 1 : 0,
    walletAllowAfter: mode === "proposed" ? 2_000n : 0n, walletAllowed: mode !== "proposed",
    walletDenied: false, unpauseAfter: mode === "proposed" ? 2_000n : 0n,
    openAccessAfter: 0n,
    permissions: { runtimeCodeHash: spec.permissions[0]!.runtimeCodeHash,
      target: spec.permissions[0]!.target, activateAfter: 2_000n, active: mode !== "proposed" },
    ...overrides };
  return { chainId: async () => spec.chainId,
    latestBlock: async () => ({ number: 100n, hash: hash("c"), timestamp: 1_900n }),
    blockHash: async () => hash("c"),
    codeHash: async (target) => target === spec.riskManager ? spec.codeHashes.riskManager
      : target === spec.executor ? spec.codeHashes.executor : spec.permissions[0]!.runtimeCodeHash,
    contractValue: async (_address, field) => values[field],
  };
}

describe("mainnet V4 state verifier", () => {
  it.each(["proposed", "canary", "open"] as const)("pins and verifies %s state", async (mode) => {
    await expect(verifyMainnetV4State({ spec, reader: reader(mode), mode })).resolves.toMatchObject({
      version: 4, mode, chainId: 196, blockNumber: "100", permissionCount: 1,
    });
  });

  it("fails closed on cap drift", async () => {
    await expect(verifyMainnetV4State({ spec, reader: reader("canary", { limits: {
      maxRouteUsdE8: 100_000_000_001n, maxWallet24hUsdE8: 500_000_000_000n,
      maxProtocol24hUsdE8: 5_000_000_000_000n,
    } }), mode: "canary" })).rejects.toThrow(/limits/i);
  });
});
