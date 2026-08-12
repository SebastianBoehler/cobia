import { describe, expect, it } from "vitest";
import { replayCodingAgentProposalOnForkV1 } from "./fork-replay";

const owner = "0x3333333333333333333333333333333333333333" as const;
const token = "0x1111111111111111111111111111111111111111" as const;
const target = "0x4444444444444444444444444444444444444444" as const;
const blockHash = `0x${"aa".repeat(32)}` as const;

describe("coding-agent fork replay", () => {
  it("uses only local Anvil mutation methods and records replayable evidence", async () => {
    const methods: string[] = [];
    const output = await replayCodingAgentProposalOnForkV1({
      proposal: {
        version: 1, requestId: "550e8400-e29b-41d4-a716-446655440010",
        policyHash: `0x${"bb".repeat(32)}`, chainId: 196, owner, deadline: 1_800_000_600,
        calls: [{ to: target, valueAtomic: "0", data: "0x12345678" }],
        minimumFinalBalances: [{ asset: token, owner, atomic: "50" }],
      },
      anchor: { number: "100", hash: blockHash },
      rpc: async (method) => {
        methods.push(method);
        if (method === "eth_sendTransaction") return `0x${"cc".repeat(32)}`;
        return true;
      },
      read: {
        getChainId: async () => 196,
        getBlock: async () => ({ hash: blockHash }),
        waitForReceipt: async () => ({
          status: "success", transactionHash: `0x${"cc".repeat(32)}`,
          blockHash, blockNumber: 101n, logs: [],
        }),
        getBalanceOf: async () => 50n,
        getCodeHash: async (address) => `0x${address.slice(2).padEnd(64, "0")}` as `0x${string}`,
        getImplementation: async () => undefined,
      },
    });

    expect(methods).toEqual([
      "anvil_setBalance",
      "anvil_impersonateAccount",
      "eth_sendTransaction",
      "anvil_stopImpersonatingAccount",
    ]);
    expect(output).toMatchObject({
      reproduced: true,
      finalBalances: [{ asset: token, owner, atomic: "50" }],
      deployments: [expect.objectContaining({ address: target })],
    });
  });

  it("fails closed when the fork is not X Layer at the pinned block", async () => {
    await expect(replayCodingAgentProposalOnForkV1({
      proposal: {
        version: 1, requestId: "550e8400-e29b-41d4-a716-446655440010",
        policyHash: `0x${"bb".repeat(32)}`, chainId: 196, owner, deadline: 1_800_000_600,
        calls: [{ to: target, valueAtomic: "0", data: "0x12345678" }], minimumFinalBalances: [],
      },
      anchor: { number: "100", hash: blockHash },
      rpc: async () => true,
      read: {
        getChainId: async () => 1952,
        getBlock: async () => ({ hash: blockHash }),
        waitForReceipt: async () => { throw new Error("not reached"); },
        getBalanceOf: async () => 0n,
        getCodeHash: async () => `0x${"00".repeat(32)}`,
        getImplementation: async () => undefined,
      },
    })).rejects.toThrow("chain ID");
  });
});
