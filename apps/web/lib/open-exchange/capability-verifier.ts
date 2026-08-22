import type { OpenIntentPolicyV3 } from "@cobia/domain";
import {
  type CapabilityProgramReplayResultV2,
  type CompiledCapabilityActionV1,
} from "@cobia/solvers";
import { createPublicClient, type Address, type Hex } from "viem";
import { deriveCapabilityAuthorityV2 } from "./capability-authority";
import {
  verifyDerivedCapabilityProposalV1,
  type CapabilityVerifierDependencies,
} from "./capability-verifier-core";

type Client = ReturnType<typeof createPublicClient>;

function objective(policy: OpenIntentPolicyV3, replay: CapabilityProgramReplayResultV2) {
  if (policy.outcomes.length !== 1) return undefined;
  const outcome = policy.outcomes[0]!;
  if (outcome.kind !== "minimum-final" && outcome.kind !== "minimum-increase") return undefined;
  const delta = replay.balanceDeltas.find(({ token, account }) =>
    token.toLowerCase() === outcome.token.toLowerCase() &&
    account.toLowerCase() === policy.owner.toLowerCase());
  if (!delta) return undefined;
  const atomic = outcome.kind === "minimum-final"
    ? BigInt(delta.afterAtomic)
    : BigInt(delta.afterAtomic) - BigInt(delta.beforeAtomic);
  return { version: 1 as const, kind: "atomic-value" as const,
    direction: "maximize" as const, atomic: atomic.toString() };
}

export async function verifyOpenCapabilityProposalV1(input: {
  runId: string;
  policy: OpenIntentPolicyV3;
  snapshot: unknown;
  program: unknown;
  evidence: unknown;
}, dependencies: CapabilityVerifierDependencies) {
  const authority = deriveCapabilityAuthorityV2(input.policy, input.snapshot);
  const verification = await verifyDerivedCapabilityProposalV1({
    ...input, authority, owner: input.policy.owner,
    inputToken: input.policy.inputs[0]!.token,
    inputAmount: BigInt(input.policy.inputs[0]!.maximumAtomic),
  }, dependencies);
  if (!verification.accepted || !verification.replay || !("execution" in verification)) {
    return { accepted: false as const, errorCodes: verification.errorCodes,
      ...(verification.replay ? { replay: verification.replay } : {}) };
  }
  return { accepted: true as const, errorCodes: [] as [], replay: verification.replay,
    execution: verification.execution, authorization: verification.authorization,
    objective: objective(input.policy, verification.replay) };
}
