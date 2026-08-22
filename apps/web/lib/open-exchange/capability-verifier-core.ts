import type { GeneralIntentPolicyV2, GeneralIntentSnapshotV1 } from "@cobia/domain";
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

type Client = ReturnType<typeof createPublicClient>;
export interface DerivedCapabilityAuthority {
  policy: GeneralIntentPolicyV2;
  snapshot: GeneralIntentSnapshotV1;
  manifest: unknown;
}

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
      } catch { return { success: false, returnData: "0x" }; }
    },
  };
}

export interface CapabilityVerifierDependencies {
  client: Client;
  executor: Address;
  attestor: Address;
  assertReady(input: { owner: Address; inputToken: Address; inputAmount: bigint }): Promise<void>;
  replay(input: { runId: string; blockNumber: string; program: unknown;
    compiled: readonly CompiledCapabilityActionV1[];
    evidence: CapabilityProgramEvidenceV2 }): Promise<CapabilityProgramReplayResultV2>;
  signTypedData(input: Parameters<typeof createGeneralAttestationV3>[0]["signTypedData"] extends
    (value: infer T) => Promise<Hex> ? T : never): Promise<Hex>;
}

export async function verifyDerivedCapabilityProposalV1(input: {
  runId: string;
  authority: DerivedCapabilityAuthority;
  owner: Address;
  inputToken: Address;
  inputAmount: bigint;
  program: unknown;
  evidence: unknown;
  nowSec?: number;
}, dependencies: CapabilityVerifierDependencies) {
  const blockNumber = BigInt(input.authority.snapshot.blockNumber);
  await dependencies.assertReady({ owner: input.owner,
    inputToken: input.inputToken, inputAmount: input.inputAmount });
  const verification = await verifyCapabilityProgramV2({
    policy: input.authority.policy, wallet: input.owner, executor: dependencies.executor,
    snapshot: input.authority.snapshot, manifest: input.authority.manifest,
    program: input.program, evidence: input.evidence,
    registry: productionCapabilityRegistryV1,
    nowSec: input.nowSec ?? Math.floor(Date.now() / 1_000),
    staticCaller: staticCaller(dependencies.client, blockNumber),
    async confirmAnchor(snapshot) {
      const block = await dependencies.client.getBlock({ blockNumber: BigInt(snapshot.blockNumber) });
      return block.hash?.toLowerCase() === snapshot.blockHash.toLowerCase();
    },
    replay: ({ compiled, evidence }) => dependencies.replay({ runId: input.runId,
      blockNumber: input.authority.snapshot.blockNumber, program: input.program,
      compiled, evidence }),
  });
  if (!verification.accepted || !verification.replay) return verification;
  const execution = projectCapabilityProgramV3({ program: input.program,
    evidence: input.evidence, verification });
  const authorization = await createGeneralAttestationV3({ program: execution,
    evidence: input.evidence, executor: dependencies.executor, attestor: dependencies.attestor,
    signTypedData: dependencies.signTypedData });
  return { ...verification, execution: { version: 3 as const, program: execution }, authorization };
}
