import {
  encodeAbiParameters,
  isAddress,
  keccak256,
  parseAbiParameters,
  type Address,
  type Hash,
  type Hex,
} from "viem";

export const ATOMIC_EXECUTION_CHAIN_ID_V3 = 196 as const;
export type AtomicConstraintKindV3 = 0 | 1;
export type AtomicReadPhaseV3 = 0 | 1;
export type AtomicDecodeTypeV3 = 0 | 1 | 2 | 3 | 4;
export type AtomicComparatorV3 = 0 | 1 | 2;

export interface AtomicApprovalV3 { token: Address; amount: bigint }
export interface AtomicActionV3 {
  capabilityKey: Hash;
  target: Address;
  approvals: AtomicApprovalV3[];
  data: Hex;
}
export interface AtomicBalanceConstraintV3 {
  token: Address;
  kind: AtomicConstraintKindV3;
  minimum: bigint;
}
export interface AtomicReadV3 {
  target: Address;
  runtimeCodeHash: Hash;
  data: Hex;
  returnWordIndex: number;
  decodeType: AtomicDecodeTypeV3;
  gasLimit: number;
}
export interface AtomicPredicateV3 {
  read: AtomicReadV3;
  phase: AtomicReadPhaseV3;
  comparator: AtomicComparatorV3;
  bound: Hash;
}
export interface AtomicExecutionProgramV3 {
  policyHash: Hash;
  manifestHash: Hash;
  canonicalProgramHash: Hash;
  simulationHash: Hash;
  pinnedBlockNumber: bigint;
  pinnedBlockHash: Hash;
  owner: Address;
  inputToken: Address;
  inputAmount: bigint;
  deadline: bigint;
  nonce: Hash;
  refundTokens: Address[];
  actions: AtomicActionV3[];
  constraints: AtomicBalanceConstraintV3[];
  predicates: AtomicPredicateV3[];
}
export interface AtomicAuthorizationV3 {
  executor: Address;
  chainId: bigint;
  executionCommitment: Hash;
  policyHash: Hash;
  manifestHash: Hash;
  canonicalProgramHash: Hash;
  simulationHash: Hash;
  pinnedBlockNumber: bigint;
  pinnedBlockHash: Hash;
  owner: Address;
  inputToken: Address;
  inputAmount: bigint;
  deadline: bigint;
  nonce: Hash;
}

const HASH = /^0x[0-9a-fA-F]{64}$/;
const DATA = /^0x(?:[0-9a-fA-F]{2}){4,}$/;
const UINT128_MAX = (1n << 128n) - 1n;
const UINT64_MAX = (1n << 64n) - 1n;

const programParameters = parseAbiParameters(
  "(bytes32 policyHash,bytes32 manifestHash,bytes32 canonicalProgramHash,bytes32 simulationHash,uint64 pinnedBlockNumber,bytes32 pinnedBlockHash,address owner,address inputToken,uint128 inputAmount,uint64 deadline,bytes32 nonce,address[] refundTokens,(bytes32 capabilityKey,address target,(address token,uint128 amount)[] approvals,bytes data)[] actions,(address token,uint8 kind,uint128 minimum)[] constraints,((address target,bytes32 runtimeCodeHash,bytes data,uint16 returnWordIndex,uint8 decodeType,uint32 gasLimit) read,uint8 phase,uint8 comparator,bytes32 bound)[] predicates)",
);
const authorizationParameters = parseAbiParameters(
  "(address executor,uint256 chainId,bytes32 executionCommitment,bytes32 policyHash,bytes32 manifestHash,bytes32 canonicalProgramHash,bytes32 simulationHash,uint64 pinnedBlockNumber,bytes32 pinnedBlockHash,address owner,address inputToken,uint128 inputAmount,uint64 deadline,bytes32 nonce)",
);
const predicateParameters = parseAbiParameters(
  "((address target,bytes32 runtimeCodeHash,bytes data,uint16 returnWordIndex,uint8 decodeType,uint32 gasLimit) read,uint8 phase,uint8 comparator,bytes32 bound)",
);

function assertHash(value: string, label: string): asserts value is Hash {
  if (!HASH.test(value) || /^0x0{64}$/i.test(value)) throw new Error(`${label} must be nonzero bytes32`);
}
function assertBytes32(value: string, label: string): asserts value is Hash {
  if (!HASH.test(value)) throw new Error(`${label} must be bytes32`);
}
function assertAddress(value: string, label: string): asserts value is Address {
  if (!isAddress(value) || /^0x0{40}$/i.test(value)) throw new Error(`${label} must be a nonzero address`);
}
function assertUint(value: bigint, maximum: bigint, label: string) {
  if (value <= 0n || value > maximum) throw new Error(`${label} is out of range`);
}

export function assertAtomicExecutionProgramV3(value: AtomicExecutionProgramV3): void {
  ["policyHash", "manifestHash", "canonicalProgramHash", "simulationHash", "pinnedBlockHash", "nonce"]
    .forEach((field) => assertHash(value[field as keyof AtomicExecutionProgramV3] as string, field));
  assertAddress(value.owner, "owner");
  assertAddress(value.inputToken, "inputToken");
  assertUint(value.inputAmount, UINT128_MAX, "inputAmount");
  assertUint(value.deadline, UINT64_MAX, "deadline");
  assertUint(value.pinnedBlockNumber, UINT64_MAX, "pinnedBlockNumber");
  if (value.refundTokens.length < 1 || value.refundTokens.length > 16 ||
    value.actions.length < 1 || value.actions.length > 8 || value.constraints.length > 8 ||
    value.predicates.length > 8 || (value.constraints.length === 0 && !value.predicates.some(({ phase }) => phase === 1))) {
    throw new Error("Atomic program collection count is invalid");
  }
  const refunds = new Set<string>();
  for (const token of value.refundTokens) {
    assertAddress(token, "refund token");
    const key = token.toLowerCase();
    if (refunds.has(key)) throw new Error("Refund tokens must be unique");
    refunds.add(key);
  }
  if (!refunds.has(value.inputToken.toLowerCase())) throw new Error("Input token must be refunded");
  let approvalCount = 0;
  let actionBytes = 0;
  for (const action of value.actions) {
    assertHash(action.capabilityKey, "capabilityKey");
    assertAddress(action.target, "action target");
    if (!DATA.test(action.data)) throw new Error("Action calldata is invalid");
    actionBytes += (action.data.length - 2) / 2;
    approvalCount += action.approvals.length;
    const approved = new Set<string>();
    for (const approval of action.approvals) {
      assertAddress(approval.token, "approval token");
      assertUint(approval.amount, UINT128_MAX, "approval amount");
      const key = approval.token.toLowerCase();
      if (!refunds.has(key) || approved.has(key)) throw new Error("Approval token is invalid");
      approved.add(key);
    }
  }
  if (approvalCount > 16 || actionBytes > 16_384) throw new Error("Atomic program resource limit exceeded");
  const constrained = new Set<string>();
  for (const constraint of value.constraints) {
    assertAddress(constraint.token, "constraint token");
    assertUint(constraint.minimum, UINT128_MAX, "constraint minimum");
    const key = constraint.token.toLowerCase();
    if (!refunds.has(key) || constrained.has(key)) throw new Error("Constraint token is invalid");
    constrained.add(key);
  }
  let predicateGas = 0;
  let predicateBytes = 0;
  const predicates = new Set<string>();
  for (const predicate of value.predicates) {
    assertAddress(predicate.read.target, "read target");
    assertHash(predicate.read.runtimeCodeHash, "runtimeCodeHash");
    assertBytes32(predicate.bound, "predicate bound");
    if (!DATA.test(predicate.read.data) || !Number.isInteger(predicate.read.returnWordIndex) ||
      predicate.read.returnWordIndex < 0 || predicate.read.returnWordIndex > 65_535 ||
      !Number.isInteger(predicate.read.gasLimit) || predicate.read.gasLimit < 1 ||
      predicate.read.gasLimit > 250_000) throw new Error("Predicate resource limit is invalid");
    if (predicate.read.decodeType > 1 && predicate.comparator !== 0) {
      throw new Error("Primitive comparison is invalid");
    }
    if (predicate.read.decodeType === 2 && BigInt(predicate.bound) >> 160n !== 0n) {
      throw new Error("Address predicate bound is invalid");
    }
    if (predicate.read.decodeType === 3 && BigInt(predicate.bound) > 1n) {
      throw new Error("Boolean predicate bound is invalid");
    }
    predicateGas += predicate.read.gasLimit;
    predicateBytes += (predicate.read.data.length - 2) / 2;
    const key = keccak256(encodeAbiParameters(predicateParameters, [predicate]));
    if (predicates.has(key)) throw new Error("Predicates must be unique");
    predicates.add(key);
  }
  if (predicateGas > 1_000_000 || predicateBytes > 4_096) {
    throw new Error("Predicate resource limit exceeded");
  }
}

export function atomicExecutionProgramHashV3(value: AtomicExecutionProgramV3): Hash {
  assertAtomicExecutionProgramV3(value);
  return keccak256(encodeAbiParameters(programParameters, [value]));
}

export function atomicAuthorizationPayloadHashV3(value: AtomicAuthorizationV3): Hash {
  return keccak256(encodeAbiParameters(authorizationParameters, [value]));
}
