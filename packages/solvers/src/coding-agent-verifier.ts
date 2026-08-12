import {
  commitment,
  routeObjectiveV2,
  StablecoinPolicyV2Schema,
  RouteSnapshotV2Schema,
} from "@cobia/domain";
import { decodeFunctionData, isAddressEqual, type Address, type Hash } from "viem";
import {
  CodingAgentProposalV1Schema,
  CodingAgentSimulationEvidenceV1Schema,
  TrustedDeploymentManifestV1Schema,
  codingAgentProposalCommitment,
  type CodingAgentSimulationEvidenceV1,
} from "./coding-agent-proposal";

const APPROVE_ABI = [{
  type: "function", name: "approve", stateMutability: "nonpayable",
  inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ name: "", type: "bool" }],
}] as const;
const SUPPLY_ABI = [{
  type: "function", name: "supply", stateMutability: "nonpayable",
  inputs: [
    { name: "asset", type: "address" }, { name: "amount", type: "uint256" },
    { name: "onBehalfOf", type: "address" }, { name: "referralCode", type: "uint16" },
  ], outputs: [],
}] as const;

export type CodingAgentRejectionCode =
  | "APPROVAL_AMOUNT_EXCEEDED" | "APPROVAL_SPENDER_NOT_ALLOWED"
  | "CHAIN_MISMATCH" | "FINAL_BALANCE_TOO_LOW" | "POLICY_MISMATCH"
  | "PROPOSAL_SCHEMA_INVALID" | "PROXY_IMPLEMENTATION_MISMATCH"
  | "RECIPIENT_MISMATCH" | "REPLAY_MISMATCH" | "STALE_EVIDENCE"
  | "TARGET_CODE_MISMATCH" | "TARGET_NOT_TRUSTED" | "VALUE_NOT_ALLOWED";

export interface ForkReplayResult {
  reproduced: boolean;
  traceHash: Hash;
  stateDiffHash: Hash;
  finalBalances: readonly { asset: Address; owner: Address; atomic: string }[];
  deployments: readonly {
    address: Address;
    runtimeCodeHash: Hash;
    implementation?: { address: Address; runtimeCodeHash: Hash };
  }[];
}

export interface VerifyCodingAgentProposalInput {
  policy: unknown;
  wallet: Address;
  snapshot: unknown;
  manifest: unknown;
  proposal: unknown;
  evidence: unknown;
  nowSec: number;
  replay(input: { proposal: unknown; evidence: CodingAgentSimulationEvidenceV1 }): Promise<ForkReplayResult>;
}

function balanceAtLeast(
  balances: readonly { asset: Address; owner: Address; atomic: string }[],
  required: { asset: Address; owner: Address; atomic: string },
): boolean {
  const found = balances.find((balance) => isAddressEqual(balance.asset, required.asset) &&
    isAddressEqual(balance.owner, required.owner));
  return Boolean(found && BigInt(found.atomic) >= BigInt(required.atomic));
}

function sameBalances(left: readonly { asset: Address; owner: Address; atomic: string }[], right: readonly { asset: Address; owner: Address; atomic: string }[]) {
  return left.length === right.length && left.every((balance) => right.some((other) =>
    isAddressEqual(balance.asset, other.asset) && isAddressEqual(balance.owner, other.owner) &&
    balance.atomic === other.atomic));
}

function sameDeployments(
  left: CodingAgentSimulationEvidenceV1["deployments"],
  right: ForkReplayResult["deployments"],
) {
  return left.length === right.length && left.every((deployment) => right.some((other) =>
    isAddressEqual(deployment.address, other.address) &&
    deployment.runtimeCodeHash === other.runtimeCodeHash &&
    (deployment.implementation === undefined
      ? other.implementation === undefined
      : other.implementation !== undefined &&
        isAddressEqual(deployment.implementation.address, other.implementation.address) &&
        deployment.implementation.runtimeCodeHash === other.implementation.runtimeCodeHash)));
}

function policyMinimum(policy: ReturnType<typeof StablecoinPolicyV2Schema.parse>) {
  const objective = routeObjectiveV2(policy);
  if (objective.kind === "swap") return { asset: objective.outputAsset, owner: policy.owner, atomic: objective.minimumOutputAtomic };
  if (objective.kind === "profit") return { asset: policy.asset, owner: policy.owner, atomic: objective.minimumFinalAtomic };
  return {
    asset: policy.asset,
    owner: policy.owner,
    atomic: (BigInt(policy.principalAtomic) * BigInt(10_000 - policy.protocolExposureBps) / 10_000n).toString(),
  };
}

export async function verifyCodingAgentProposalV1(input: VerifyCodingAgentProposalInput): Promise<{
  accepted: boolean;
  errorCodes: CodingAgentRejectionCode[];
}> {
  const errors = new Set<CodingAgentRejectionCode>();
  let proposal: ReturnType<typeof CodingAgentProposalV1Schema.parse>;
  let evidence: CodingAgentSimulationEvidenceV1;
  try {
    proposal = CodingAgentProposalV1Schema.parse(input.proposal);
    evidence = CodingAgentSimulationEvidenceV1Schema.parse(input.evidence);
  } catch {
    return { accepted: false, errorCodes: ["PROPOSAL_SCHEMA_INVALID"] };
  }
  const policy = StablecoinPolicyV2Schema.parse(input.policy);
  const snapshot = RouteSnapshotV2Schema.parse(input.snapshot);
  const manifest = TrustedDeploymentManifestV1Schema.parse(input.manifest);
  const proposalHash = codingAgentProposalCommitment(proposal);
  if (proposal.chainId !== policy.executionChainId || manifest.chainId !== policy.executionChainId ||
    evidence.chainId !== policy.executionChainId || snapshot.chainId !== policy.executionChainId) errors.add("CHAIN_MISMATCH");
  if (proposal.requestId !== policy.requestId || proposal.policyHash !== commitment(policy) ||
    !isAddressEqual(proposal.owner, input.wallet) || !isAddressEqual(policy.owner, input.wallet)) errors.add("POLICY_MISMATCH");
  const capturedAt = Math.floor(Date.parse(snapshot.capturedAt) / 1_000);
  if (proposal.deadline > policy.deadline || input.nowSec > proposal.deadline ||
    input.nowSec > capturedAt + policy.maxSnapshotAgeSec || evidence.blockNumber !== snapshot.blockNumber ||
    evidence.blockHash !== snapshot.blockHash || evidence.proposalHash !== proposalHash) errors.add("STALE_EVIDENCE");

  for (const call of proposal.calls) {
    const target = manifest.deployments.find((deployment) => isAddressEqual(deployment.address, call.to));
    const observed = evidence.deployments.find((deployment) => isAddressEqual(deployment.address, call.to));
    if (!target) { errors.add("TARGET_NOT_TRUSTED"); continue; }
    if (!observed || observed.runtimeCodeHash !== target.runtimeCodeHash) errors.add("TARGET_CODE_MISMATCH");
    if (target.implementation && (!observed?.implementation ||
      !isAddressEqual(target.implementation.address, observed.implementation.address) ||
      target.implementation.runtimeCodeHash !== observed.implementation.runtimeCodeHash)) errors.add("PROXY_IMPLEMENTATION_MISMATCH");
    if (call.valueAtomic !== "0") errors.add("VALUE_NOT_ALLOWED");
    try {
      if (target.capability.kind === "erc20-approve") {
        const decoded = decodeFunctionData({ abi: APPROVE_ABI, data: call.data });
        const [spender, amount] = decoded.args;
        if (!isAddressEqual(call.to, policy.asset) || !target.capability.approvalSpenders.some((value) => isAddressEqual(value, spender))) errors.add("APPROVAL_SPENDER_NOT_ALLOWED");
        if (amount > BigInt(policy.principalAtomic)) errors.add("APPROVAL_AMOUNT_EXCEEDED");
      } else {
        const decoded = decodeFunctionData({ abi: SUPPLY_ABI, data: call.data });
        const [asset, amount, onBehalfOf, referralCode] = decoded.args;
        if (!isAddressEqual(asset, policy.asset) || amount > BigInt(policy.principalAtomic)) errors.add("APPROVAL_AMOUNT_EXCEEDED");
        if (!isAddressEqual(onBehalfOf, policy.owner) || referralCode !== 0) errors.add("RECIPIENT_MISMATCH");
      }
    } catch { errors.add("TARGET_NOT_TRUSTED"); }
  }
  const required = policyMinimum(policy);
  if (!balanceAtLeast(proposal.minimumFinalBalances, required) || !balanceAtLeast(evidence.finalBalances, required)) errors.add("FINAL_BALANCE_TOO_LOW");
  if (errors.size > 0) return { accepted: false, errorCodes: [...errors].sort() };
  const replay = await input.replay({ proposal, evidence });
  if (!replay.reproduced || replay.traceHash !== evidence.traceHash || replay.stateDiffHash !== evidence.stateDiffHash ||
    !sameBalances(replay.finalBalances, evidence.finalBalances) || !sameDeployments(evidence.deployments, replay.deployments)) errors.add("REPLAY_MISMATCH");
  return { accepted: errors.size === 0, errorCodes: [...errors].sort() };
}
