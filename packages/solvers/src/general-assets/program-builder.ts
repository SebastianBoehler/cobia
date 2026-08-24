import {
  GeneralAssetPolicyV1Schema,
  GeneralAssetProgramV1Schema,
  commitment,
  isNativeAssetAddress,
  type GeneralAssetPolicyV1,
} from "@cobia/domain";
import { type Address, type Hash, type Hex } from "viem";
import {
  GeneralAssetEvidenceArtifactV1Schema,
  SolverDecisionV1Schema,
  type GeneralAssetEvidenceArtifactV1,
} from "../transaction-program/decision";
import { canonicalGeneralAssetProgramHash } from "./program-verifier";

export interface GeneralAssetSwapCompilationV1 {
  target: Address;
  data: Hex;
  valueAtomic: string;
  gasLimit: number;
  approval?: { spender: Address; maximumAtomic: string; data: Hex };
  quoteHash: Hash;
  fetchedAtSec: number;
  expiresAtSec: number;
}

export interface GeneralAssetSwapBuildRequestV1 {
  chainId: 1 | 196;
  executor: Address;
  owner: Address;
  inputToken: Address;
  outputToken: Address;
  inputAtomic: string;
  minimumOutputAtomic: string;
  maximumSlippageBps: number;
}

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

function evidenceExpiry(evidence: GeneralAssetEvidenceArtifactV1): number {
  return Math.min(
    ...evidence.identities.map(({ expiresAtSec }) => expiresAtSec),
    ...evidence.valuations.map(({ expiresAtSec }) => expiresAtSec),
  );
}

function assertSupportedPolicy(policy: GeneralAssetPolicyV1): void {
  if (policy.sourceChainId !== policy.destinationChainId || policy.outputs.length !== 1 ||
      policy.outputs[0]!.chainId !== policy.sourceChainId || policy.limits.maxStages < 1 ||
      policy.limits.maxCallsPerStage < 1 ||
      !policy.allowedAdapters.some(({ id, version }) => id === "okx.swap" && version === 1)) {
    throw new Error("The production general asset solver supports one-stage same-chain OKX swaps only");
  }
}

export async function buildGeneralAssetDecisionV1(input: {
  policy: unknown;
  evidence: unknown;
  executor: Address;
  nowSec: number | (() => number);
  compile(request: GeneralAssetSwapBuildRequestV1): Promise<GeneralAssetSwapCompilationV1>;
}) {
  const policy = GeneralAssetPolicyV1Schema.parse(input.policy);
  const evidence = GeneralAssetEvidenceArtifactV1Schema.parse(input.evidence);
  const nowSec = () => typeof input.nowSec === "function" ? input.nowSec() : input.nowSec;
  assertSupportedPolicy(policy);
  if (commitment(evidence.manifest) !== policy.manifestHash) {
    throw new Error("General asset evidence targets a different manifest");
  }
  if (evidenceExpiry(evidence) <= nowSec()) {
    throw new Error("General asset evidence expired before solver compilation");
  }

  const output = policy.outputs[0]!;
  required(evidence.identities.find((value) => commitment(value) === policy.inputIdentityHash &&
    value.chainId === policy.input.chainId && value.token === policy.input.token),
  "General asset input identity evidence is unavailable");
  required(evidence.identities.find((value) => commitment(value) === output.identityHash &&
    value.chainId === output.chainId && value.token === output.token),
  "General asset output identity evidence is unavailable");
  const valuation = required(evidence.valuations.find((value) =>
    commitment(value) === policy.inputValuationHash &&
    value.assetIdentityHash === policy.inputIdentityHash &&
    value.inputAtomic === policy.input.maximumAtomic),
  "General asset input valuation evidence is unavailable");
  if (BigInt(valuation.conservativeValueUsdE8) > BigInt(policy.input.maximumUsdE8)) {
    throw new Error("General asset input valuation exceeds signed authority");
  }

  const entry = required(evidence.manifest.entries.find((value) =>
    value.providerFamily === "okx" && value.adapter.id === "okx.swap" &&
    value.adapter.version === 1 && value.chainId === policy.sourceChainId),
  "The signed manifest has no exact OKX swap adapter");
  if (policy.forbiddenTargets.some(({ chainId, target }) =>
    chainId === entry.chainId && target === entry.target)) {
    throw new Error("The registered OKX target is forbidden by policy");
  }

  const compiled = await input.compile({
    chainId: policy.sourceChainId,
    executor: input.executor,
    owner: policy.owner,
    inputToken: policy.input.token,
    outputToken: output.token,
    inputAtomic: policy.input.maximumAtomic,
    minimumOutputAtomic: output.minimumAtomic,
    maximumSlippageBps: policy.limits.maxSlippageBps,
  });
  const observedAtSec = nowSec();
  if (compiled.target !== entry.target) {
    throw new Error("OKX compiler returned an unregistered target");
  }
  if (!entry.selectors.includes(compiled.data.slice(0, 10))) {
    throw new Error("OKX compiler returned an unregistered selector");
  }
  const nativeInput = isNativeAssetAddress(policy.input.token);
  if (nativeInput && compiled.approval) throw new Error("Native input cannot require an approval");
  if (!nativeInput && !compiled.approval) throw new Error("ERC-20 input requires an exact approval");
  if (compiled.approval &&
      !entry.approvalSpenders.some(({ address }) => address === compiled.approval!.spender)) {
    throw new Error("OKX compiler returned an unregistered approval spender");
  }
  const expectedValue = nativeInput ? policy.input.maximumAtomic : "0";
  if ((!nativeInput && compiled.approval!.maximumAtomic !== policy.input.maximumAtomic) ||
      compiled.valueAtomic !== expectedValue) {
    throw new Error("OKX compiler exceeded exact input authority");
  }
  const calldataBytes = (compiled.data.length - 2) / 2;
  if (compiled.expiresAtSec <= observedAtSec || compiled.fetchedAtSec > observedAtSec ||
      compiled.gasLimit > Number(policy.limits.maxGasPerStage) ||
      calldataBytes > policy.limits.maxCalldataBytes) {
    throw new Error("OKX compilation is stale or exceeds signed resource limits");
  }

  const programDeadline = Math.min(
    policy.deadline,
    policy.competition.closesAt,
    compiled.expiresAtSec,
  );
  if (programDeadline <= observedAtSec) throw new Error("General asset program has no fresh execution window");
  const refundTokens = [policy.input.token, output.token]
    .filter((token) => !isNativeAssetAddress(token)).sort() as Address[];
  const stageId = commitment({
    domain: "cobia.general-asset-stage.v1",
    policyHash: commitment(policy),
    quoteHash: compiled.quoteHash,
    chainId: policy.sourceChainId,
    target: compiled.target,
    data: compiled.data,
  }) as Hash;
  const stage = {
    stageId,
    index: 0,
    chainId: policy.sourceChainId,
    predecessorStageId: null,
    adapter: entry.adapter,
    target: entry.target,
    targetRuntimeCodeHash: entry.runtimeCodeHash,
    calldata: compiled.data,
    nativeValueAtomic: expectedValue,
    input: {
      token: policy.input.token,
      maximumAtomic: policy.input.maximumAtomic,
      maximumUsdE8: policy.input.maximumUsdE8,
      identityEvidenceHash: policy.inputIdentityHash,
      valuationEvidenceHash: policy.inputValuationHash,
    },
    outputs: [{ token: output.token, minimumIncreaseAtomic: output.minimumAtomic,
      identityEvidenceHash: output.identityHash }],
    approvals: compiled.approval ? [{ token: policy.input.token, spender: compiled.approval.spender,
      maximumAtomic: policy.input.maximumAtomic }] : [],
    refundTokens,
    finality: { confirmations: 12 },
    delivery: { kind: "none" as const },
  };
  const identityEvidenceHashes = evidence.identities.map((value) => commitment(value) as Hash).sort();
  const valuationEvidenceHashes = evidence.valuations.map((value) => commitment(value) as Hash).sort();
  const base = {
    version: 1 as const,
    kind: "general-asset-program" as const,
    policyHash: commitment(policy) as Hash,
    manifestHash: policy.manifestHash,
    canonicalProgramHash: compiled.quoteHash,
    owner: policy.owner,
    deadline: programDeadline,
    identityEvidenceHashes,
    valuationEvidenceHashes,
    stages: [stage],
    finalOutput: { chainId: output.chainId, token: output.token, minimumAtomic: output.minimumAtomic },
  };
  const program = GeneralAssetProgramV1Schema.parse({
    ...base,
    canonicalProgramHash: canonicalGeneralAssetProgramHash(base),
  });
  return SolverDecisionV1Schema.parse({
    version: 1,
    decision: "submit",
    proposalKind: "general-asset-program",
    program,
    evidence,
    provenance: {
      version: 1,
      runner: "cobia-general-asset-solver@1",
      dependencies: [{ name: "okx-onchainos", version: "v6" }],
      sources: [],
      commandHashes: [],
      generatedFiles: [],
    },
  });
}
