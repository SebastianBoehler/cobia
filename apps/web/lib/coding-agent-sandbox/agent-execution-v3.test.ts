import { commitment } from "@cobia/domain";
import { describe, expect, it } from "vitest";
import { encodeFunctionData, erc20Abi } from "viem";
import { buildAtomicAuthorizationV3 } from "../atomic-execution/authorization-v3";
import { encodeAtomicExecutionCallV3 } from "../atomic-execution/encode-v3";
import type { AtomicExecutionProgramV3 } from "../atomic-execution/types-v3";
import { exactApprovalCalls, prepareAgentExecutionV3 } from "./agent-execution-v3";

const owner = "0x1111111111111111111111111111111111111111" as const;
const executor = "0x2222222222222222222222222222222222222222" as const;
const token = "0x3333333333333333333333333333333333333333" as const;
const target = "0x4444444444444444444444444444444444444444" as const;
const hash = `0x${"55".repeat(32)}` as const;
const signature = `0x${"66".repeat(65)}` as const;
const policy = {
  owner,
  deadline: 2_000,
  maxEvidenceAgeSec: 300,
  manifestHash: `0x${"67".repeat(32)}` as const,
  nonce: `0x${"71".repeat(32)}` as const,
  input: { token, maxAtomic: "10" },
};
const snapshot = {
  capturedAt: new Date(1_000_000).toISOString(),
  blockNumber: "123",
  blockHash: `0x${"70".repeat(32)}` as const,
};
const program: AtomicExecutionProgramV3 = {
  policyHash: commitment(policy),
  manifestHash: policy.manifestHash,
  canonicalProgramHash: `0x${"68".repeat(32)}`,
  simulationHash: `0x${"69".repeat(32)}`,
  pinnedBlockNumber: 123n,
  pinnedBlockHash: snapshot.blockHash,
  owner,
  inputToken: token,
  inputAmount: 10n,
  deadline: 2_000n,
  nonce: policy.nonce,
  refundTokens: [token],
  actions: [{
    capabilityKey: `0x${"72".repeat(32)}`,
    target,
    approvals: [{ token, amount: 10n }],
    data: "0x12345678",
  }],
  constraints: [{ token, kind: 0, minimum: 1n }],
  predicates: [],
};

function stored() {
  const authorization = buildAtomicAuthorizationV3(program, executor);
  const call = encodeAtomicExecutionCallV3({ program, authorization, expectedExecutor: executor, signature });
  const execution = { version: 3, program };
  const attestation = { version: 3, authorization, signature, call };
  const json = (value: unknown) => JSON.parse(JSON.stringify(
    value,
    (_, entry) => typeof entry === "bigint" ? entry.toString() : entry,
  ));
  const executionPayload = json(execution);
  const attestationPayload = json(attestation);
  return {
    state: "attested",
    owner,
    policyHash: commitment(policy),
    snapshotHash: commitment(snapshot),
    manifestHash: program.manifestHash,
    blockNumber: snapshot.blockNumber,
    blockHash: snapshot.blockHash,
    policy: structuredClone(policy),
    snapshot: structuredClone(snapshot),
    artifacts: [
      { kind: "execution", artifactHash: commitment(executionPayload), payload: executionPayload },
      { kind: "authorization", artifactHash: commitment(attestationPayload), payload: attestationPayload },
    ],
  };
}

describe("general agent mainnet execution preparation", () => {
  it("replaces an expanded allowance with the exact verified amount", () => {
    expect(exactApprovalCalls({
      token,
      executor,
      allowance: 11n,
      required: 10n,
    })).toEqual([
      {
        to: token,
        data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [executor, 0n] }),
        value: "0x0",
      },
      {
        to: token,
        data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [executor, 10n] }),
        value: "0x0",
      },
    ]);
  });

  it("reconstructs the exact V3 owner approval and atomic executor call", () => {
    const result = prepareAgentExecutionV3({ context: stored(), owner, executor, nowSec: 1_100 });
    expect(result.approval).toEqual({
      to: token,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [executor, 10n] }),
      value: "0x0",
    });
    expect(result.execution).toEqual({
      ...encodeAtomicExecutionCallV3({
        program,
        authorization: buildAtomicAuthorizationV3(program, executor),
        expectedExecutor: executor,
        signature,
      }),
      value: "0x0",
    });
  });

  it("rejects call, owner, executor, deadline, freshness, and artifact commitment drift", () => {
    const cases = [
      { mutate: (value: ReturnType<typeof stored>) => { (value as { owner: string }).owner = target; } },
      { executor: target },
      { mutate: (value: ReturnType<typeof stored>) => { (value.policy as { deadline: number }).deadline = 1_999; } },
      { mutate: (value: ReturnType<typeof stored>) => { value.policy.input.maxAtomic = "9"; } },
      { mutate: (value: ReturnType<typeof stored>) => { value.policy.manifestHash = hash; } },
      { mutate: (value: ReturnType<typeof stored>) => { value.snapshot.blockHash = hash; } },
      { nowSec: 1_301 },
      { mutate: (value: ReturnType<typeof stored>) => { value.artifacts[0]!.artifactHash = hash; } },
      { mutate: (value: ReturnType<typeof stored>) => {
        (value.artifacts[1]!.payload as { call: { data: string } }).call.data = "0x12345678";
      } },
    ];
    for (const candidate of cases) {
      const context = stored();
      candidate.mutate?.(context);
      expect(() => prepareAgentExecutionV3({
        context,
        owner,
        executor: candidate.executor ?? executor,
        nowSec: candidate.nowSec ?? 1_100,
      })).toThrow();
    }
  });
});
