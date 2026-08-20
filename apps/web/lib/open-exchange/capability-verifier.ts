import type { OpenIntentPolicyV3 } from "@cobia/domain";
import {
  verifyCapabilityProgramV2,
  type CapabilityProgramEvidenceV2,
  type CapabilityProgramReplayResultV2,
  type CompiledCapabilityActionV1,
  type StaticReadCallerV1,
} from "@cobia/solvers";
import { createPublicClient, keccak256, type Address, type Hex } from "viem";
import { projectCapabilityProgramV3 } from "../atomic-execution/project-capability-program-v3";
import { productionCapabilityRegistryV1 } from "../capabilities/registry";
import { createGeneralAttestationV3 } from "../coding-agent-sandbox/general-attestation-v3";
import { deriveCapabilityAuthorityV2 } from "./capability-authority";

type Client = ReturnType<typeof createPublicClient>;

function staticCaller(client: Client, blockNumber: bigint): StaticReadCallerV1 {
  return {
    async getCodeHash(target) {
      const code = await client.getCode({ address: target, blockNumber });
      return !code || code === "0x" ? undefined : keccak256(code);
    },
    async call({ target, data, gasLimit }) {
      try {
        const result = await client.call({ to: target, data, gas: BigInt(gasLimit), blockNumber });
        return { success: true, returnData: (result.data ?? "0x") as Hex };
      } catch {
        return { success: false, returnData: "0x" };
      }
    },
  };
}

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
}, dependencies: {
  client: Client;
  executor: Address;
  attestor: Address;
  assertReady(input: { owner: Address; inputToken: Address; inputAmount: bigint }): Promise<void>;
  replay(input: { runId: string; blockNumber: string; program: unknown;
    compiled: readonly CompiledCapabilityActionV1[];
    evidence: CapabilityProgramEvidenceV2 }): Promise<CapabilityProgramReplayResultV2>;
  signTypedData(input: Parameters<typeof createGeneralAttestationV3>[0]["signTypedData"] extends
    (value: infer T) => Promise<Hex> ? T : never): Promise<Hex>;
}) {
  const authority = deriveCapabilityAuthorityV2(input.policy, input.snapshot);
  const blockNumber = BigInt(authority.snapshot.blockNumber);
  await dependencies.assertReady({ owner: input.policy.owner,
    inputToken: input.policy.inputs[0]!.token,
    inputAmount: BigInt(input.policy.inputs[0]!.maximumAtomic) });
  const verification = await verifyCapabilityProgramV2({
    policy: authority.policy,
    wallet: input.policy.owner,
    executor: dependencies.executor,
    snapshot: authority.snapshot,
    manifest: authority.manifest,
    program: input.program,
    evidence: input.evidence,
    registry: productionCapabilityRegistryV1,
    nowSec: Math.floor(Date.now() / 1_000),
    staticCaller: staticCaller(dependencies.client, blockNumber),
    async confirmAnchor(snapshot) {
      const block = await dependencies.client.getBlock({ blockNumber: BigInt(snapshot.blockNumber) });
      return block.hash?.toLowerCase() === snapshot.blockHash.toLowerCase();
    },
    replay: ({ compiled, evidence }) => dependencies.replay({ runId: input.runId,
      blockNumber: authority.snapshot.blockNumber, program: input.program,
      compiled, evidence }),
  });
  if (!verification.accepted || !verification.replay) {
    return { accepted: false as const, errorCodes: verification.errorCodes,
      ...(verification.replay ? { replay: verification.replay } : {}) };
  }
  const execution = projectCapabilityProgramV3({ program: input.program,
    evidence: input.evidence, verification });
  const authorization = await createGeneralAttestationV3({ program: execution,
    evidence: input.evidence, executor: dependencies.executor, attestor: dependencies.attestor,
    signTypedData: dependencies.signTypedData });
  return { accepted: true as const, errorCodes: [] as [], replay: verification.replay,
    execution: { version: 3 as const, program: execution }, authorization,
    objective: objective(input.policy, verification.replay) };
}
