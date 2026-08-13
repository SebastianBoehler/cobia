import { commitment } from "@cobia/domain";
import {
  CapabilityProgramEvidenceV1Schema,
  CapabilityProgramV1Schema,
  capabilityProgramCommitmentV1,
  type CompiledCapabilityActionV1,
} from "@cobia/solvers";
import { getAddress, isAddressEqual, type Address } from "viem";
import {
  assertAtomicExecutionProgramV2,
  atomicCapabilityKeyV2,
  type AtomicActionV2,
  type AtomicExecutionProgramV2,
} from "./types-v2";

export interface ProjectCapabilityProgramInputV2 {
  program: unknown;
  evidence: unknown;
  verification: {
    accepted: boolean;
    errorCodes: readonly string[];
    compiled: readonly CompiledCapabilityActionV1[];
  };
}

function addToken(tokens: Address[], candidate: Address): void {
  const token = getAddress(candidate);
  if (!tokens.some((value) => isAddressEqual(value, token))) tokens.push(token);
}

function projectAction(
  declared: ReturnType<typeof CapabilityProgramV1Schema.parse>["actions"][number],
  compiled: CompiledCapabilityActionV1,
): AtomicActionV2 {
  if (compiled.capabilityId !== declared.capabilityId ||
    compiled.capabilityVersion !== declared.capabilityVersion) {
    throw new Error("Compiled capability identity does not match the canonical program");
  }
  if (compiled.data.slice(0, 10).toLowerCase() !== compiled.selector.toLowerCase()) {
    throw new Error("Compiled capability selector does not match calldata");
  }
  return {
    capabilityKey: atomicCapabilityKeyV2(compiled.capabilityId, compiled.capabilityVersion),
    target: getAddress(compiled.target),
    approvals: compiled.spend.map((spend) => ({
      token: getAddress(spend.token),
      amount: BigInt(spend.atomic),
    })),
    data: compiled.data,
  };
}

export function projectCapabilityProgramV2(
  input: ProjectCapabilityProgramInputV2,
): AtomicExecutionProgramV2 {
  if (!input.verification.accepted || input.verification.errorCodes.length > 0) {
    throw new Error("Atomic projection requires an accepted verification");
  }
  const program = CapabilityProgramV1Schema.parse(input.program);
  const evidence = CapabilityProgramEvidenceV1Schema.parse(input.evidence);
  if (input.verification.compiled.length !== program.actions.length) {
    throw new Error("Accepted compilation does not cover every program action");
  }
  if (evidence.programHash !== capabilityProgramCommitmentV1(program) ||
    evidence.blockNumber !== program.pinnedBlock.number ||
    evidence.blockHash !== program.pinnedBlock.hash) {
    throw new Error("Simulation evidence does not bind the canonical program");
  }
  if (program.constraints.some((constraint) => !isAddressEqual(constraint.account, program.owner))) {
    throw new Error("Atomic execution permits only owner constraints");
  }

  const actions = program.actions.map((action, index) =>
    projectAction(action, input.verification.compiled[index]!));
  const refundTokens: Address[] = [];
  addToken(refundTokens, program.input.token);
  for (const compiled of input.verification.compiled) {
    for (const spend of compiled.spend) addToken(refundTokens, spend.token);
    for (const output of compiled.guaranteedOutputs) addToken(refundTokens, output.token);
  }
  for (const constraint of program.constraints) addToken(refundTokens, constraint.token);

  const value: AtomicExecutionProgramV2 = {
    policyHash: program.policyHash,
    manifestHash: program.manifestHash,
    canonicalProgramHash: capabilityProgramCommitmentV1(program),
    simulationHash: commitment(evidence),
    pinnedBlockNumber: BigInt(program.pinnedBlock.number),
    pinnedBlockHash: program.pinnedBlock.hash,
    owner: getAddress(program.owner),
    inputToken: getAddress(program.input.token),
    inputAmount: BigInt(program.input.atomic),
    deadline: BigInt(program.deadline),
    nonce: program.nonce,
    refundTokens,
    actions,
    constraints: program.constraints.map((constraint) => ({
      token: getAddress(constraint.token),
      minimumIncrease: BigInt(constraint.minimumIncreaseAtomic),
    })),
  };
  assertAtomicExecutionProgramV2(value);
  return value;
}
