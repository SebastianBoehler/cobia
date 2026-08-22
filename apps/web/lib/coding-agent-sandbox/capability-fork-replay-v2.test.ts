import { commitment } from "@cobia/domain";
import { type CapabilityProgramV2, type CompiledCapabilityActionV1 } from "@cobia/solvers";
import { describe, expect, it, vi } from "vitest";
import { replayCapabilityProgramOnForkV2 } from "./capability-fork-replay-v2";

const owner = "0x1111111111111111111111111111111111111111" as const;
const executor = "0x2222222222222222222222222222222222222222" as const;
const inputToken = "0x3333333333333333333333333333333333333333" as const;
const outputToken = "0x4444444444444444444444444444444444444444" as const;
const target = "0x5555555555555555555555555555555555555555" as const;
const blockHash = `0x${"66".repeat(32)}` as const;
const targetCodeHash = `0x${"77".repeat(32)}` as const;
const inputCodeHash = `0x${"88".repeat(32)}` as const;
const outputCodeHash = `0x${"99".repeat(32)}` as const;
const balanceRead = (token: typeof inputToken | typeof outputToken, runtimeCodeHash: `0x${string}`) => ({
  target: token, runtimeCodeHash,
  data: `0x70a08231${"0".repeat(24)}${owner.slice(2)}` as `0x${string}`,
  returnWordIndex: 0, decodeType: "uint256" as const, gasLimit: 50_000, label: "balance",
});
const beforeRead = balanceRead(inputToken, inputCodeHash);
const afterRead = balanceRead(outputToken, outputCodeHash);
const program = {
  version: 2, kind: "general-onchain", requestId: "550e8400-e29b-41d4-a716-446655440000",
  chainId: 196, policyHash: `0x${"11".repeat(32)}`, manifestHash: `0x${"22".repeat(32)}`,
  owner, executor, pinnedBlock: { number: "123", hash: blockHash }, deadline: 2_000_000_000,
  nonce: `0x${"33".repeat(32)}`, input: { token: inputToken, atomic: "10" },
  actions: [{ capabilityId: "protocol.action", capabilityVersion: 1, valueAtomic: "0", parameters: {} }],
  balanceConstraints: [{ kind: "minimumIncrease", token: outputToken, atomic: "9" }],
  predicates: [
    { ...beforeRead, phase: "before", comparator: "gte", bound: "10" },
    { ...afterRead, phase: "after", comparator: "gte", bound: "9" },
  ],
  objective: { kind: "maximize", read: afterRead },
} satisfies CapabilityProgramV2;
const compiled = [{
  capabilityId: "protocol.action", capabilityVersion: 1, target, selector: "0x12345678",
  data: "0x12345678", expectedGas: 100_000, spend: [{ token: inputToken, atomic: "10" }],
  guaranteedOutputs: [{ token: outputToken, account: executor, minimumIncreaseAtomic: "9" }],
  deployments: [{ address: target, runtimeCodeHash: targetCodeHash }], evidencePredicates: [],
}] satisfies CompiledCapabilityActionV1[];
const word = (value: bigint) => `0x${value.toString(16).padStart(64, "0")}` as `0x${string}`;

function harness(overrides: Record<string, unknown> = {}) {
  const order: string[] = [];
  let transaction = 0;
  const balances = new Map<string, bigint[]>([
    [`${inputToken}:${owner}`, [10n]],
    [`${outputToken}:${owner}`, [0n, 9n]],
    [`${inputToken}:${executor}`, [0n, 0n]],
    [`${outputToken}:${executor}`, [0n, 9n]],
  ]);
  const code = new Map<string, `0x${string}`>([
    [target, targetCodeHash], [inputToken, inputCodeHash], [outputToken, outputCodeHash],
  ]);
  const read = {
    getChainId: async () => 196,
    getBlock: async () => ({ hash: blockHash, timestamp: 1_000n }),
    getBalanceOf: async (token: string, account: string) => balances.get(`${token}:${account}`)?.shift() ?? 0n,
    waitForReceipt: async (hash: `0x${string}`) => ({
      status: "success" as const, transactionHash: hash,
      logs: [{ address: target, data: "0x" as const, topics: [] }],
    }),
    getCodeHash: async (address: string) => code.get(address)!,
    getImplementation: async () => undefined,
    staticCall: async ({ target: readTarget }: { target: string }) => {
      order.push(`read:${readTarget}`);
      return word(readTarget === inputToken ? 10n : 9n);
    },
    ...overrides,
  };
  const forkRpc = vi.fn(async (method: string, _params?: readonly unknown[]) => {
    order.push(method);
    return method === "eth_sendTransaction"
      ? `0x${(++transaction).toString(16).padStart(64, "0")}`
      : null;
  });
  return { order, read, forkRpc };
}

describe("general capability fork replay", () => {
  it("observes before/actions/refunds/after/objective in order only on the disposable fork", async () => {
    const { order, read, forkRpc } = harness();
    const result = await replayCapabilityProgramOnForkV2({ program, compiled, forkRpc, read });
    expect(result.reproduced).toBe(true);
    expect(result.observations).toMatchObject([
      { phase: "before", decodedValue: "10", satisfied: true },
      { phase: "after", decodedValue: "9", satisfied: true },
    ]);
    expect(result.objective).toMatchObject({ decodedValue: "9" });
    expect(result.stateDiffHash).toBe(commitment(result.balanceDeltas));
    const reads = order.reduce<number[]>((values, item, index) => item.startsWith("read:") ? [...values, index] : values, []);
    const sends = order.reduce<number[]>((values, item, index) => item === "eth_sendTransaction" ? [...values, index] : values, []);
    expect(reads[0]).toBeLessThan(sends[0]!);
    expect(reads[1]).toBeGreaterThan(sends.at(-1)!);
    expect(reads[2]).toBeGreaterThan(sends.at(-1)!);
    expect(forkRpc.mock.calls.filter(([method]) => method === "evm_setNextBlockTimestamp")
      .map(([, params]) => params)).toEqual(sends.map((_, index) => [1_001 + index]));
    expect(forkRpc.mock.calls.some(([method]) => method.startsWith("wallet_"))).toBe(false);
  });

  it("rejects wrong chain, anchor, code identity, static failure, and reverted receipts", async () => {
    await expect(replayCapabilityProgramOnForkV2({
      program, compiled, forkRpc: async () => null,
      read: harness({ getChainId: async () => 1952 }).read,
    })).rejects.toThrow(/chain/i);
    await expect(replayCapabilityProgramOnForkV2({
      program, compiled, forkRpc: async () => null,
      read: harness({ getBlock: async () => ({ hash: `0x${"ff".repeat(32)}` }) }).read,
    })).rejects.toThrow(/anchor/i);
    await expect(replayCapabilityProgramOnForkV2({
      program, compiled, forkRpc: harness().forkRpc,
      read: harness({ getCodeHash: async () => `0x${"ff".repeat(32)}` }).read,
    })).rejects.toThrow(/code/i);
    await expect(replayCapabilityProgramOnForkV2({
      program, compiled, forkRpc: harness().forkRpc,
      read: harness({ staticCall: async () => { throw new Error("static reverted"); } }).read,
    })).rejects.toThrow(/static reverted/i);
    await expect(replayCapabilityProgramOnForkV2({
      program, compiled, forkRpc: harness().forkRpc,
      read: harness({ waitForReceipt: async (hash: `0x${string}`) => ({ status: "reverted" as const, transactionHash: hash, logs: [] }) }).read,
    })).rejects.toThrow(/reverted/i);
  });
});
