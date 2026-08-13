import {
  encodeAbiParameters,
  isAddress,
  keccak256,
  parseAbiParameters,
  toBytes,
  type Address,
  type Hash,
  type Hex,
} from "viem";

export const ATOMIC_EXECUTION_CHAIN_ID_V2 = 196 as const;

export interface AtomicApprovalV2 {
  token: Address;
  amount: bigint;
}

export interface AtomicActionV2 {
  capabilityKey: Hash;
  target: Address;
  approvals: AtomicApprovalV2[];
  data: Hex;
}

export interface AtomicBalanceConstraintV2 {
  token: Address;
  minimumIncrease: bigint;
}

export interface AtomicExecutionProgramV2 {
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
  actions: AtomicActionV2[];
  constraints: AtomicBalanceConstraintV2[];
}

export interface AtomicAuthorizationV2 {
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
  "(bytes32 policyHash,bytes32 manifestHash,bytes32 canonicalProgramHash,bytes32 simulationHash,uint64 pinnedBlockNumber,bytes32 pinnedBlockHash,address owner,address inputToken,uint128 inputAmount,uint64 deadline,bytes32 nonce,address[] refundTokens,(bytes32 capabilityKey,address target,(address token,uint128 amount)[] approvals,bytes data)[] actions,(address token,uint128 minimumIncrease)[] constraints)",
);
const authorizationParameters = parseAbiParameters(
  "(address executor,uint256 chainId,bytes32 executionCommitment,bytes32 policyHash,bytes32 manifestHash,bytes32 canonicalProgramHash,bytes32 simulationHash,uint64 pinnedBlockNumber,bytes32 pinnedBlockHash,address owner,address inputToken,uint128 inputAmount,uint64 deadline,bytes32 nonce)",
);

function assertHash(value: string, label: string): asserts value is Hash {
  if (!HASH.test(value) || /^0x0{64}$/i.test(value)) throw new Error(`${label} must be bytes32`);
}

function assertAddress(value: string, label: string): asserts value is Address {
  if (!isAddress(value) || /^0x0{40}$/i.test(value)) {
    throw new Error(`${label} must be a nonzero address`);
  }
}

function assertUint(value: bigint, maximum: bigint, label: string): void {
  if (value <= 0n || value > maximum) throw new Error(`${label} is out of range`);
}

export function atomicCapabilityKeyV2(id: string, version: number): Hash {
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/.test(id) || !Number.isSafeInteger(version) || version < 1) {
    throw new Error("Capability identity is invalid");
  }
  return keccak256(toBytes(`${id}@${version}`));
}

export function assertAtomicExecutionProgramV2(value: AtomicExecutionProgramV2): void {
  ["policyHash", "manifestHash", "canonicalProgramHash", "simulationHash", "pinnedBlockHash", "nonce"]
    .forEach((field) => assertHash(value[field as keyof AtomicExecutionProgramV2] as string, field));
  assertAddress(value.owner, "owner");
  assertAddress(value.inputToken, "inputToken");
  assertUint(value.inputAmount, UINT128_MAX, "inputAmount");
  assertUint(value.deadline, UINT64_MAX, "deadline");
  assertUint(value.pinnedBlockNumber, UINT64_MAX, "pinnedBlockNumber");
  if (value.refundTokens.length < 1 || value.refundTokens.length > 16 ||
    value.actions.length < 1 || value.actions.length > 8 ||
    value.constraints.length < 1 || value.constraints.length > 8) {
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
  let calldataBytes = 0;
  for (const action of value.actions) {
    assertHash(action.capabilityKey, "capabilityKey");
    assertAddress(action.target, "action target");
    if (!DATA.test(action.data)) throw new Error("Action calldata is invalid");
    calldataBytes += (action.data.length - 2) / 2;
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
  if (approvalCount > 16 || calldataBytes > 16_384) throw new Error("Atomic program resource limit exceeded");
  for (const constraint of value.constraints) {
    assertAddress(constraint.token, "constraint token");
    assertUint(constraint.minimumIncrease, UINT128_MAX, "constraint minimumIncrease");
    if (!refunds.has(constraint.token.toLowerCase())) throw new Error("Constraint token must be refunded");
  }
}

export function atomicExecutionProgramHashV2(value: AtomicExecutionProgramV2): Hash {
  assertAtomicExecutionProgramV2(value);
  return keccak256(encodeAbiParameters(programParameters, [value]));
}

export function atomicAuthorizationPayloadHashV2(value: AtomicAuthorizationV2): Hash {
  return keccak256(encodeAbiParameters(authorizationParameters, [value]));
}
