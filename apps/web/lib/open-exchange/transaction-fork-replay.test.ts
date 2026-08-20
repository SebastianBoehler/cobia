import { commitment, OpenIntentPolicyV3Schema } from "@cobia/domain";
import { encodeAbiParameters, keccak256, padHex, type Address, type Hash, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { replayOpenTransactionProgramV1 } from "./transaction-fork-replay";

const hash = (byte: string) => `0x${byte.repeat(64)}` as Hash;
const owner = "0x1111111111111111111111111111111111111111" as Address;
const inputToken = "0x2222222222222222222222222222222222222222" as Address;
const outputToken = "0x3333333333333333333333333333333333333333" as Address;
const target = "0x4444444444444444444444444444444444444444" as Address;
const transfer = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as Hash;
const policy = OpenIntentPolicyV3Schema.parse({
  version: 3, kind: "open-onchain", requestId: "550e8400-e29b-41d4-a716-446655440000",
  displayGoal: "Swap exact input", owner, executionChainIds: [196], nonce: hash("1"),
  createdAt: 2_000_000_000, deadline: 2_000_001_800,
  competition: { closesAt: 2_000_000_300, maxRevisionsPerSolver: 5 }, maxEvidenceAgeSec: 300,
  inputs: [{ chainId: 196, token: inputToken, maximumAtomic: "10" }],
  outcomes: [{ kind: "minimum-increase", chainId: 196, token: outputToken, atomic: "1" }],
  limits: { maxStages: 2, maxTransactions: 1, maxApprovals: 0, maxCalldataBytes: 1024,
    maxGasPerTransaction: "5000000", maxNativeValueAtomicByChain: [{ chainId: 196, atomic: "0" }] },
  forbiddenTargets: [], forbiddenAssets: [],
});
const snapshot = { version: 1 as const, kind: "open-onchain" as const,
  requestId: policy.requestId, capturedAt: "2033-05-18T03:33:20.000Z",
  anchors: [{ chainId: 196 as const, blockNumber: "68461706", blockHash: hash("2") }] };
const payload = { version: 1 as const, provider: "evm.raw@1" as const, stageId: "01-swap",
  transaction: { chainId: 196 as const, from: owner, to: target,
    data: "0x12345678" as Hex, valueAtomic: "0" } };
const program = { version: 1 as const, programId: "550e8400-e29b-41d4-a716-446655440001",
  requestId: policy.requestId, policyHash: commitment(policy), owner, createdAt: 2_000_000_010,
  deadline: 2_000_000_200, maxEvidenceAgeSec: 300,
  stages: [{ id: "01-swap", kind: "wallet-transaction" as const, chainId: 196 as const,
    dependsOn: [], provider: "evm.raw@1", quoteHash: hash("3"), responseHash: hash("4"),
    fetchedAt: 2_000_000_010, expiresAt: 2_000_000_200, sender: owner, recipient: owner,
    input: { token: inputToken, atomic: "10" },
    output: { chainId: 196 as const, token: outputToken, minimumAtomic: "1" },
    transaction: { target, selector: "0x12345678" as Hex,
      dataHash: keccak256(payload.transaction.data),
      valueAtomic: "0" }, tools: ["protocol-open"] }] };
const providerArtifacts = { version: 1 as const, artifacts: [{ stageId: "01-swap",
  provider: "evm.raw@1", payloadHash: commitment(payload), payload }] };

function encoded(value: bigint) {
  return encodeAbiParameters([{ type: "uint256" }], [value]);
}

function fakeRpc() {
  let balances = new Map([[inputToken, 10n], [outputToken, 0n]]);
  let saved = new Map(balances);
  let sequence = 0;
  const receipts = new Map<string, unknown>();
  return async (method: string, params: readonly unknown[] = []): Promise<unknown> => {
    if (["anvil_setBalance", "anvil_impersonateAccount", "anvil_stopImpersonatingAccount"].includes(method)) return true;
    if (method === "evm_snapshot") { saved = new Map(balances); return "0x1"; }
    if (method === "evm_revert") { balances = new Map(saved); return true; }
    if (method === "eth_getCode") return "0x60006000";
    if (method === "eth_call") {
      const call = params[0] as { to: Address };
      return encoded(balances.get(call.to) ?? 0n);
    }
    if (method === "eth_sendTransaction") {
      balances.set(inputToken, balances.get(inputToken)! - 10n);
      balances.set(outputToken, balances.get(outputToken)! + 2n);
      const txHash = hash((++sequence).toString(16));
      receipts.set(txHash, { status: "0x1", gasUsed: "0x186a0", logs: [
        { address: inputToken, data: encoded(10n), topics: [transfer, padHex(owner), padHex(target)] },
        { address: outputToken, data: encoded(2n), topics: [transfer, padHex(target), padHex(owner)] },
      ] });
      return txHash;
    }
    if (method === "eth_getTransactionReceipt") return receipts.get(String(params[0])) ?? null;
    if (method === "debug_traceTransaction") return { type: "CALL", result: "0x" };
    throw new Error(`Unexpected RPC method ${method}`);
  };
}

const placeholder = { stageId: "01-swap", chainId: 196 as const, blockNumber: "68461706",
  blockHash: hash("2"), transactionDataHash: program.stages[0].transaction.dataHash,
  success: true, calldataBytes: 4, gasUsed: "1", traceHash: hash("5"), stateDiffHash: hash("6"),
  eventsHash: hash("7"), completeAssetCoverage: true, assetDeltas: [], allowanceDeltas: [],
  codeIdentities: [] };

describe("open transaction fork replay", () => {
  it("reconstructs wallet token deltas from fork receipts and matches only exact evidence", async () => {
    const first = await replayOpenTransactionProgramV1({ program,
      evidence: { version: 1, programHash: commitment(program), capturedAt: 2_000_000_020,
        simulations: [placeholder] }, providerArtifacts, snapshot, rpc: fakeRpc() });
    expect(first.reproduced).toBe(false);
    expect(first.simulations[0]?.assetDeltas).toEqual([
      { token: inputToken, account: owner, beforeAtomic: "10", afterAtomic: "0", deltaAtomic: "-10" },
      { token: outputToken, account: owner, beforeAtomic: "0", afterAtomic: "2", deltaAtomic: "2" },
    ]);
    const exact = await replayOpenTransactionProgramV1({ program,
      evidence: { version: 1, programHash: commitment(program), capturedAt: 2_000_000_020,
        simulations: first.simulations }, providerArtifacts, snapshot, rpc: fakeRpc() });
    expect(exact.reproduced).toBe(true);
  });
});
