import { commitment } from "@cobia/domain";
import type { GeneralAssetProgramVerdictV1 } from "@cobia/solvers";
import {
  encodeFunctionData,
  isAddressEqual,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { COBIA_EXECUTOR_V4_ABI } from "./abi";
import {
  authorizationPayloadHashV4,
  buildAuthorizationV4,
  executionProgramHashV4,
  type ExecutionProgramV4,
  type VerifierAuthorizationV4,
} from "./commitment";

const AUTHORIZATION_TYPES = {
  VerifierAuthorizationV4: [{ name: "payloadHash", type: "bytes32" }],
} as const;

export function authorizationTypedDataV4(authorization: VerifierAuthorizationV4) {
  return {
    domain: {
      name: "CobiaGeneralAssetExecutor",
      version: "4",
      chainId: authorization.chainId,
      verifyingContract: authorization.executor,
    },
    types: AUTHORIZATION_TYPES,
    primaryType: "VerifierAuthorizationV4" as const,
    message: { payloadHash: authorizationPayloadHashV4(authorization) },
  };
}

function sameAddressArray(left: readonly Address[], right: readonly Address[]): boolean {
  return left.length === right.length && left.every((value, index) => isAddressEqual(value, right[index]!));
}

function sameCalls(left: ExecutionProgramV4["calls"], right: ExecutionProgramV4["calls"]): boolean {
  return left.length === right.length && left.every((call, index) => {
    const expected = right[index]!;
    return call.adapterKey === expected.adapterKey && isAddressEqual(call.target, expected.target) &&
      call.value === expected.value && call.gasLimit === expected.gasLimit && call.data === expected.data &&
      call.approvals.length === expected.approvals.length && call.approvals.every((approval, approvalIndex) => {
        const expectedApproval = expected.approvals[approvalIndex]!;
        return isAddressEqual(approval.token, expectedApproval.token) && approval.amount === expectedApproval.amount;
      });
  });
}

function sameConstraints(
  left: ExecutionProgramV4["constraints"],
  right: ExecutionProgramV4["constraints"],
): boolean {
  return left.length === right.length && left.every((constraint, index) => {
    const expected = right[index]!;
    return isAddressEqual(constraint.token, expected.token) && constraint.kind === expected.kind &&
      constraint.minimum === expected.minimum;
  });
}

function assertMatchesVerifiedStage(
  verdict: Extract<GeneralAssetProgramVerdictV1, { accepted: true }>,
  stageIndex: number,
  execution: ExecutionProgramV4,
): void {
  const stage = verdict.program.stages[stageIndex];
  const compiled = verdict.compiledStages[stageIndex];
  const replay = verdict.replays[stageIndex];
  if (!stage || !compiled || !replay || verdict.replayHash !== commitment(verdict.replays)) {
    throw new Error("Accepted verdict is missing exact replay evidence");
  }
  const expectedCall = {
    adapterKey: compiled.adapterKey,
    target: compiled.target,
    value: BigInt(compiled.valueAtomic),
    gasLimit: compiled.gasLimit,
    approvals: compiled.approvals.map(({ token, spender, maximumAtomic }) => {
      if (!isAddressEqual(spender, compiled.target)) throw new Error("Approval spender does not match adapter target");
      return { token, amount: BigInt(maximumAtomic) };
    }),
    data: compiled.data,
  };
  const expectedConstraints = stage.outputs.map(({ token, minimumIncreaseAtomic }) => ({
    token,
    kind: 1 as const,
    minimum: BigInt(minimumIncreaseAtomic),
  }));
  const fixedFieldsMatch = execution.policyHash === verdict.program.policyHash &&
    execution.manifestHash === verdict.program.manifestHash &&
    execution.canonicalProgramHash === verdict.program.canonicalProgramHash &&
    execution.stageHash === commitment(stage) && execution.simulationHash === commitment(replay) &&
    execution.sourceChainId === BigInt(stage.chainId) && execution.owner === verdict.program.owner &&
    execution.inputToken === stage.input.token && execution.inputAmount <= BigInt(stage.input.maximumAtomic) &&
    execution.inputAmount <= BigInt(verdict.policy.input.maximumAtomic) &&
    execution.inputUsdE8 === BigInt(verdict.inputExposureUsdE8) &&
    execution.inputUsdE8 <= BigInt(verdict.policy.input.maximumUsdE8) &&
    execution.outputToken === stage.outputs[0]!.token && execution.deadline <= BigInt(verdict.program.deadline) &&
    execution.nonce === verdict.policy.nonce && execution.pinnedBlockNumber === BigInt(replay.blockNumber) &&
    execution.pinnedBlockHash === replay.blockHash &&
    execution.inputIdentityEvidenceHash === verdict.policy.inputIdentityHash &&
    verdict.program.identityEvidenceHashes.includes(execution.outputIdentityEvidenceHash) &&
    execution.valuationEvidenceHash === verdict.policy.inputValuationHash;
  if (!fixedFieldsMatch || !sameAddressArray(execution.refundTokens, compiled.refundTokens) ||
      !sameCalls(execution.calls, [expectedCall]) || !sameConstraints(execution.constraints, expectedConstraints)) {
    throw new Error("Execution V4 does not match the independently verified stage");
  }
}

export async function attestExecutionProgramV4(input: {
  verdict: GeneralAssetProgramVerdictV1;
  stageIndex: number;
  execution: ExecutionProgramV4;
  executor: Address;
  signTypedData(typedData: ReturnType<typeof authorizationTypedDataV4>): Promise<Hex>;
}) {
  if (!input.verdict.accepted) throw new Error("Only an accepted general asset verdict can be attested");
  assertMatchesVerifiedStage(input.verdict, input.stageIndex, input.execution);
  const executionCommitment = executionProgramHashV4(input.execution);
  const authorization = buildAuthorizationV4(input.execution, input.executor);
  if (authorization.executionCommitment !== executionCommitment) {
    throw new Error("Execution commitment changed during authorization");
  }
  const signature = await input.signTypedData(authorizationTypedDataV4(authorization));
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new Error("Verifier signature must contain 65 bytes");
  const nativeValue = input.execution.calls.reduce((total, call) => total + call.value, 0n);
  const data = encodeFunctionData({
    abi: COBIA_EXECUTOR_V4_ABI,
    functionName: "execute",
    args: [input.execution, authorization, signature],
  });
  return {
    version: 4 as const,
    stageIndex: input.stageIndex,
    authorization,
    signature,
    call: { to: input.executor, data, value: nativeValue },
    evidenceHash: commitment({
      programHash: input.verdict.program.canonicalProgramHash,
      compiled: input.verdict.compiledStages[input.stageIndex],
      replay: input.verdict.replays[input.stageIndex],
      executionCommitment,
    }) as Hash,
  };
}
