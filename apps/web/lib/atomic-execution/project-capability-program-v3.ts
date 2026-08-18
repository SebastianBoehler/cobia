import { commitment } from "@cobia/domain";
import {
  CapabilityProgramEvidenceV2Schema,
  CapabilityProgramV2Schema,
  capabilityProgramCommitmentV2,
  type CompiledCapabilityActionV1,
} from "@cobia/solvers";
import { getAddress, isAddressEqual, padHex, toHex, type Address, type Hash } from "viem";
import { atomicCapabilityKeyV2 } from "./types-v2";
import {
  assertAtomicExecutionProgramV3,
  type AtomicComparatorV3,
  type AtomicConstraintKindV3,
  type AtomicDecodeTypeV3,
  type AtomicExecutionProgramV3,
  type AtomicPredicateV3,
  type AtomicReadPhaseV3,
} from "./types-v3";

export interface ProjectCapabilityProgramInputV3 {
  program: unknown;
  evidence: unknown;
  verification: {
    accepted: boolean;
    errorCodes: readonly string[];
    compiled: readonly CompiledCapabilityActionV1[];
    replay?: unknown;
  };
}

function addToken(tokens: Address[], candidate: Address): void {
  const token = getAddress(candidate);
  if (!tokens.some((value) => isAddressEqual(value, token))) tokens.push(token);
}

function decodeType(value: string): AtomicDecodeTypeV3 {
  const values = { uint256: 0, int256: 1, address: 2, bool: 3, bytes32: 4 } as const;
  const mapped = values[value as keyof typeof values];
  if (mapped === undefined) throw new Error("Static read decode type is invalid");
  return mapped;
}

function phase(value: string): AtomicReadPhaseV3 {
  if (value === "before") return 0;
  if (value === "after") return 1;
  throw new Error("Static read phase is invalid");
}

function comparator(value: string): AtomicComparatorV3 {
  if (value === "eq") return 0;
  if (value === "gte") return 1;
  if (value === "lte") return 2;
  throw new Error("Static read comparator is invalid");
}

function bound(value: string, type: string): Hash {
  if (type === "address") return padHex(getAddress(value), { size: 32 });
  if (type === "bool") return toHex(value === "true" ? 1n : 0n, { size: 32 });
  if (type === "bytes32") return value as Hash;
  return toHex(BigInt(value), { size: 32 });
}

function projectPredicate(
  value: ReturnType<typeof CapabilityProgramV2Schema.parse>["predicates"][number],
): AtomicPredicateV3 {
  return {
    read: {
      target: getAddress(value.target),
      runtimeCodeHash: value.runtimeCodeHash,
      data: value.data,
      returnWordIndex: value.returnWordIndex,
      decodeType: decodeType(value.decodeType),
      gasLimit: value.gasLimit,
    },
    phase: phase(value.phase),
    comparator: comparator(value.comparator),
    bound: bound(value.bound, value.decodeType),
  };
}

export function projectCapabilityProgramV3(
  input: ProjectCapabilityProgramInputV3,
): AtomicExecutionProgramV3 {
  if (!input.verification.accepted || input.verification.errorCodes.length > 0) {
    throw new Error("Atomic projection requires an accepted verification");
  }
  if (!input.verification.replay) throw new Error("Atomic projection requires an independent replay");
  const program = CapabilityProgramV2Schema.parse(input.program);
  const evidence = CapabilityProgramEvidenceV2Schema.parse(input.evidence);
  if (input.verification.compiled.length !== program.actions.length) {
    throw new Error("Accepted compilation does not cover every program action");
  }
  if (evidence.programHash !== capabilityProgramCommitmentV2(program) ||
    evidence.blockNumber !== program.pinnedBlock.number || evidence.blockHash !== program.pinnedBlock.hash) {
    throw new Error("Simulation evidence does not bind the canonical program");
  }

  const actions = program.actions.map((declared, index) => {
    const compiled = input.verification.compiled[index]!;
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
      approvals: compiled.spend.map(({ token, atomic }) => ({ token: getAddress(token), amount: BigInt(atomic) })),
      data: compiled.data,
    };
  });
  const refundTokens: Address[] = [];
  addToken(refundTokens, program.input.token);
  for (const compiled of input.verification.compiled) {
    for (const { token } of compiled.spend) addToken(refundTokens, token);
    for (const { token } of compiled.guaranteedOutputs) addToken(refundTokens, token);
  }
  for (const { token } of program.balanceConstraints) addToken(refundTokens, token);

  const value: AtomicExecutionProgramV3 = {
    policyHash: program.policyHash,
    manifestHash: program.manifestHash,
    canonicalProgramHash: capabilityProgramCommitmentV2(program),
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
    constraints: program.balanceConstraints.map(({ kind, token, atomic }) => ({
      token: getAddress(token),
      kind: (kind === "minimumFinal" ? 0 : 1) as AtomicConstraintKindV3,
      minimum: BigInt(atomic),
    })),
    predicates: program.predicates.map(projectPredicate),
  };
  assertAtomicExecutionProgramV3(value);
  return value;
}
