import { keccak256, type Address } from "viem";
import { describe, expect, it, vi } from "vitest";
import { assertGeneralAssetV4Ready } from "./general-asset-v4-readiness";

const address = (byte: string) => `0x${byte.repeat(40)}` as Address;
const code = "0x6000" as const;
const hash = keccak256(code);
const executor = address("1");
const registry = address("2");
const riskManager = address("3");
const verifier = address("4");
const target = address("5");
const config = { executor, executorCodeHash: hash, registry, registryCodeHash: hash,
  riskManager, riskManagerCodeHash: hash, protocolCapUsdE8: "5000000000000" };

function client(accessMode = 1) {
  return { getCode: vi.fn(async () => code), readContract: vi.fn(async (input: {
    address: Address; functionName: string }) => {
    if (input.address === executor && input.functionName === "registry") return registry;
    if (input.address === executor && input.functionName === "riskManager") return riskManager;
    if (input.address === riskManager && input.functionName === "executor") return executor;
    if (input.address === riskManager && input.functionName === "verifierSigner") return verifier;
    if (input.address === riskManager && input.functionName === "paused") return false;
    if (input.address === riskManager && input.functionName === "accessMode") return accessMode;
    if (input.address === riskManager && input.functionName === "limits") {
      return [100_000_000_000n, 500_000_000_000n, 5_000_000_000_000n];
    }
    if (input.address === registry && input.functionName === "paused") return false;
    if (input.address === registry && input.functionName === "isActive") return true;
    throw new Error("Unexpected read");
  }) };
}

describe("general asset V4 production readiness", () => {
  it("requires the configured executor, risk, registry, limits, and public access", async () => {
    await expect(assertGeneralAssetV4Ready({ client: client() as never, config, verifier, target,
      selector: "0x12345678", blockNumber: "123" })).resolves.toBeUndefined();
    await expect(assertGeneralAssetV4Ready({ client: client(0) as never, config, verifier, target,
      selector: "0x12345678", blockNumber: "123" })).rejects.toThrow("public-ready");
  });
});
