import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getChainId = vi.fn(async () => 1952);
const getBlockNumber = vi.fn(async () => 38_600_000n);
const getCode = vi.fn<(input: { address: string }) => Promise<`0x${string}`>>();
const readContract = vi.fn<(input: { address: string; functionName: string }) => Promise<unknown>>();

vi.mock("viem", async (importOriginal) => ({
  ...await importOriginal<typeof import("viem")>(),
  createPublicClient: vi.fn(() => ({ getChainId, getBlockNumber, getCode, readContract })),
  http: vi.fn(() => undefined),
  keccak256: vi.fn((code: string) => ({
    "0x6001": "0x5de8b09ab2d521591020ccacace3eb18b42900ce7e300cf4aa31e634af14416d",
    "0x6002": "0xc1797561f6b425e5ffcfcc92115b30b85be68ea5f0484d968d03261743867137",
    "0x6003": "0x8fa3b48a0db878b56da8fd71a61e4a83f262c3e7d619f5eed5d48de6addd7083",
  })[code]),
}));

import { TESTNET_DEPLOYMENT, readTestnetDeploymentStatus } from "./read-testnet-status";

const runtimeCode = {
  [TESTNET_DEPLOYMENT.registry.address]: "0x6001",
  [TESTNET_DEPLOYMENT.riskManager.address]: "0x6002",
  [TESTNET_DEPLOYMENT.executor.address]: "0x6003",
} as const;

beforeEach(() => {
  getChainId.mockResolvedValue(1952);
  getCode.mockImplementation(async ({ address }) => runtimeCode[address as keyof typeof runtimeCode]);
  readContract.mockImplementation(async ({ address, functionName }) => {
    if (functionName === "owner") return TESTNET_DEPLOYMENT.owner;
    if (functionName === "paused") return true;
    if (functionName === "executor") return TESTNET_DEPLOYMENT.executor.address;
    if (functionName === "verifierSigner") return TESTNET_DEPLOYMENT.verifier;
    if (functionName === "registry") return TESTNET_DEPLOYMENT.registry.address;
    if (functionName === "riskManager") return TESTNET_DEPLOYMENT.riskManager.address;
    throw new Error(`Unexpected read ${address} ${functionName}`);
  });
});

afterEach(() => vi.clearAllMocks());

describe("testnet deployment status", () => {
  it("accepts the exact paused deployment at a live chain-1952 block", async () => {
    await expect(readTestnetDeploymentStatus("https://rpc.invalid")).resolves.toMatchObject({
      chainId: 1952,
      blockNumber: "38600000",
      state: "paused",
      contracts: {
        registry: { verified: true },
        riskManager: { verified: true },
        executor: { verified: true },
      },
    });
  });

  it("rejects a chain mismatch", async () => {
    getChainId.mockResolvedValueOnce(196);
    await expect(readTestnetDeploymentStatus("https://rpc.invalid")).rejects.toThrow(
      "Testnet RPC chain mismatch",
    );
  });

  it("rejects replaced runtime code", async () => {
    getCode.mockResolvedValueOnce("0xdead");
    await expect(readTestnetDeploymentStatus("https://rpc.invalid")).rejects.toThrow(
      "Registry runtime code mismatch",
    );
  });

  it("rejects an unpaused deployment", async () => {
    readContract.mockImplementation(async ({ functionName }) => {
      if (functionName === "paused") return false;
      return TESTNET_DEPLOYMENT.owner;
    });
    await expect(readTestnetDeploymentStatus("https://rpc.invalid")).rejects.toThrow(
      "Testnet deployment is not paused",
    );
  });
});
