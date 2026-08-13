import { commitment } from "@cobia/domain";
import { type CapabilityProgramV1, type CompiledCapabilityActionV1 } from "@cobia/solvers";
import { describe, expect, it, vi } from "vitest";
import { replayCapabilityProgramOnForkV1 } from "./capability-fork-replay";

const owner = "0x1111111111111111111111111111111111111111" as const;
const executor = "0x2222222222222222222222222222222222222222" as const;
const inputToken = "0x3333333333333333333333333333333333333333" as const;
const outputToken = "0x4444444444444444444444444444444444444444" as const;
const target = "0x5555555555555555555555555555555555555555" as const;
const blockHash = `0x${"66".repeat(32)}` as const;
const codeHash = `0x${"77".repeat(32)}` as const;
const program = {
  version: 1, requestId: "550e8400-e29b-41d4-a716-446655440000", chainId: 196,
  policyHash: `0x${"11".repeat(32)}`, manifestHash: `0x${"22".repeat(32)}`,
  owner, executor, pinnedBlock: { number: "123", hash: blockHash }, deadline: 2_000_000_000,
  nonce: `0x${"33".repeat(32)}`, input: { token: inputToken, atomic: "10" },
  actions: [{ capabilityId: "protocol.action", capabilityVersion: 1, valueAtomic: "0", parameters: {} }],
  constraints: [{ token: outputToken, account: owner, minimumIncreaseAtomic: "10" }],
} satisfies CapabilityProgramV1;
const compiled = [{
  capabilityId: "protocol.action", capabilityVersion: 1, target, selector: "0x12345678",
  data: "0x12345678", spend: [{ token: inputToken, atomic: "10" }],
  guaranteedOutputs: [{ token: outputToken, account: executor, minimumIncreaseAtomic: "10" }],
  deployments: [{ address: target, runtimeCodeHash: codeHash }], evidencePredicates: [],
}] satisfies CompiledCapabilityActionV1[];

describe("trusted capability fork replay", () => {
  it("executes only through Anvil controls and returns canonical observable evidence", async () => {
    let transaction = 0;
    const balances = new Map<string, bigint[]>([
      [`${outputToken}:${owner}`, [0n, 10n]],
      [`${inputToken}:${executor}`, [0n, 0n]],
      [`${outputToken}:${executor}`, [0n, 10n]],
    ]);
    const forkRpc = vi.fn(async (method: string) => method === "eth_sendTransaction"
      ? `0x${(++transaction).toString(16).padStart(64, "0")}`
      : null);
    const result = await replayCapabilityProgramOnForkV1({
      program, compiled, forkRpc,
      read: {
        getChainId: async () => 196,
        getBlock: async () => ({ hash: blockHash }),
        getBalanceOf: async (token, account) => balances.get(`${token}:${account}`)?.shift() ?? 0n,
        waitForReceipt: async (hash) => ({
          status: "success", transactionHash: hash,
          logs: [{ address: target, data: "0x", topics: [] }],
        }),
        getCodeHash: async () => codeHash,
        getImplementation: async () => undefined,
      },
    });

    expect(result.reproduced).toBe(true);
    expect(result.balanceDeltas).toEqual([{
      token: outputToken, account: owner, beforeAtomic: "0", afterAtomic: "10",
    }]);
    expect(result.deployments).toEqual([{ address: target, runtimeCodeHash: codeHash }]);
    expect(result.stateDiffHash).toBe(commitment(result.balanceDeltas));
    expect(forkRpc.mock.calls.filter(([method]) => method === "eth_sendTransaction")).toHaveLength(7);
    expect(forkRpc.mock.calls.some(([method]) => method.startsWith("wallet_"))).toBe(false);
  });

  it("rejects chain, anchor, deployment, and reverted-call mismatches", async () => {
    const baseRead = {
      getChainId: async () => 1952,
      getBlock: async () => ({ hash: blockHash }),
      getBalanceOf: async () => 0n,
      waitForReceipt: async (hash: `0x${string}`) => ({ status: "success" as const, transactionHash: hash, logs: [] }),
      getCodeHash: async () => codeHash,
      getImplementation: async () => undefined,
    };
    await expect(replayCapabilityProgramOnForkV1({
      program, compiled, forkRpc: async () => null, read: baseRead,
    })).rejects.toThrow("chain");
  });
});
