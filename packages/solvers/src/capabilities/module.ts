import type { Address, Hash, Hex } from "viem";
import type { CapabilityProgramV1, CanonicalJsonValue } from "./program";

export interface CapabilitySpendV1 {
  token: Address;
  atomic: string;
}

export interface CapabilityOutputV1 {
  token: Address;
  account: Address;
  minimumIncreaseAtomic: string;
}

export interface CapabilityDeploymentV1 {
  address: Address;
  runtimeCodeHash: Hash;
  implementation?: { address: Address; runtimeCodeHash: Hash };
}

export interface CompiledCapabilityActionV1 {
  capabilityId: string;
  capabilityVersion: number;
  target: Address;
  selector: Hex;
  data: Hex;
  spend: readonly CapabilitySpendV1[];
  guaranteedOutputs: readonly CapabilityOutputV1[];
  deployments: readonly CapabilityDeploymentV1[];
  evidencePredicates: readonly CanonicalJsonValue[];
}

export interface CapabilityCompileInputV1<T> {
  program: CapabilityProgramV1;
  actionIndex: number;
  parameters: T;
  manifest: unknown;
}

export interface CapabilityEvidenceInputV1<T> extends CapabilityCompileInputV1<T> {
  compiled: CompiledCapabilityActionV1;
  evidence: unknown;
}

export interface CapabilityFindingV1 {
  code: string;
  message: string;
}

export interface CapabilityModuleV1<T> {
  readonly id: string;
  readonly version: number;
  parseParameters(input: unknown): T;
  compile(input: CapabilityCompileInputV1<T>): CompiledCapabilityActionV1;
  verifyEvidence(input: CapabilityEvidenceInputV1<T>): CapabilityFindingV1[];
}

export type AnyCapabilityModuleV1 = CapabilityModuleV1<unknown>;
