import { describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, keccak256 } from "viem";
import { captureGeneralAssetIdentityV1, EIP1967_ADMIN_SLOT,
  EIP1967_IMPLEMENTATION_SLOT } from "./general-asset-chain-reader";

const token = "0x1111111111111111111111111111111111111111" as const;
const implementation = "0x2222222222222222222222222222222222222222" as const;
const admin = "0x3333333333333333333333333333333333333333" as const;
const blockHash = `0x${"44".repeat(32)}` as const;
const tokenCode = "0x6001" as const;
const implementationCode = "0x6002" as const;
const word = (address: `0x${string}`) => encodeAbiParameters([{ type: "address" }], [address]);

describe("general asset chain reader", () => {
  it("captures a pinned EIP-1967 implementation, admin, code, and decimals", async () => {
    const client = {
      getChainId: vi.fn(async () => 1),
      getBlockNumber: vi.fn(async () => 1000n),
      getBlock: vi.fn(async () => ({ number: 1000n, hash: blockHash })),
      getCode: vi.fn(async ({ address }: { address: `0x${string}` }) =>
        address === implementation ? implementationCode : tokenCode),
      getStorageAt: vi.fn(async ({ slot }: { slot: `0x${string}` }) =>
        slot === EIP1967_IMPLEMENTATION_SLOT ? word(implementation)
          : slot === EIP1967_ADMIN_SLOT ? word(admin) : `0x${"00".repeat(32)}` as `0x${string}`),
      readContract: vi.fn(async () => 6),
    };

    const captured = await captureGeneralAssetIdentityV1({ chainId: 1, token }, client, 2_000_000_000);

    expect(captured.anchor).toMatchObject({ blockNumber: "1000", blockHash });
    expect(captured.claimedIdentity).toEqual({
      runtimeCodeHash: keccak256(tokenCode), decimals: 6,
      proxy: { kind: "eip1967", implementation,
        implementationRuntimeCodeHash: keccak256(implementationCode), admin },
    });
    await expect(captured.reader.runtimeCodeHash(1, implementation, 1000n))
      .resolves.toBe(keccak256(implementationCode));
  });

  it("rejects a token without runtime code", async () => {
    const client = { getChainId: async () => 1, getBlockNumber: async () => 1000n,
      getBlock: async () => ({ number: 1000n, hash: blockHash }),
      getCode: async () => undefined, getStorageAt: async () => undefined,
      readContract: async () => 18 };

    await expect(captureGeneralAssetIdentityV1({ chainId: 1, token }, client, 2_000_000_000))
      .rejects.toThrow(/runtime code/i);
  });
});
