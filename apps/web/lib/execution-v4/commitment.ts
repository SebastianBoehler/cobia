import {
  encodeAbiParameters,
  isAddress,
  keccak256,
  parseAbiParameters,
  type Address,
  type Hash,
  type Hex,
} from "viem";

export type ConstraintKindV4 = 0 | 1;
export interface ApprovalV4 { token: Address; spender: Address; amount: bigint }
export interface CallV4 {
  adapterKey: Hash;
  target: Address;
  targetRuntimeCodeHash: Hash;
  value: bigint;
  gasLimit: number;
  approvals: ApprovalV4[];
  data: Hex;
}
export interface BalanceConstraintV4 {
  token: Address;
  kind: ConstraintKindV4;
  minimum: bigint;
}
export interface ExecutionProgramV4 {
  policyHash: Hash;
  manifestHash: Hash;
  canonicalProgramHash: Hash;
  inputIdentityEvidenceHash: Hash;
  outputIdentityEvidenceHash: Hash;
  valuationEvidenceHash: Hash;
  stageHash: Hash;
  simulationHash: Hash;
  pinnedBlockNumber: bigint;
  pinnedBlockHash: Hash;
  sourceChainId: bigint;
  owner: Address;
  inputToken: Address;
  outputToken: Address;
  inputAmount: bigint;
  inputUsdE8: bigint;
  deadline: bigint;
  nonce: Hash;
  refundTokens: Address[];
  calls: CallV4[];
  constraints: BalanceConstraintV4[];
}
export interface VerifierAuthorizationV4 {
  executor: Address;
  chainId: bigint;
  executionCommitment: Hash;
  policyHash: Hash;
  manifestHash: Hash;
  canonicalProgramHash: Hash;
  inputIdentityEvidenceHash: Hash;
  outputIdentityEvidenceHash: Hash;
  valuationEvidenceHash: Hash;
  stageHash: Hash;
  simulationHash: Hash;
  pinnedBlockNumber: bigint;
  pinnedBlockHash: Hash;
  owner: Address;
  inputToken: Address;
  outputToken: Address;
  inputAmount: bigint;
  inputUsdE8: bigint;
  deadline: bigint;
  nonce: Hash;
}

const programParameters = parseAbiParameters(
  "(bytes32 policyHash,bytes32 manifestHash,bytes32 canonicalProgramHash,bytes32 inputIdentityEvidenceHash,bytes32 outputIdentityEvidenceHash,bytes32 valuationEvidenceHash,bytes32 stageHash,bytes32 simulationHash,uint64 pinnedBlockNumber,bytes32 pinnedBlockHash,uint256 sourceChainId,address owner,address inputToken,address outputToken,uint128 inputAmount,uint128 inputUsdE8,uint64 deadline,bytes32 nonce,address[] refundTokens,(bytes32 adapterKey,address target,bytes32 targetRuntimeCodeHash,uint96 value,uint32 gasLimit,(address token,address spender,uint128 amount)[] approvals,bytes data)[] calls,(address token,uint8 kind,uint128 minimum)[] constraints)",
);
const authorizationParameters = parseAbiParameters(
  "(address executor,uint256 chainId,bytes32 executionCommitment,bytes32 policyHash,bytes32 manifestHash,bytes32 canonicalProgramHash,bytes32 inputIdentityEvidenceHash,bytes32 outputIdentityEvidenceHash,bytes32 valuationEvidenceHash,bytes32 stageHash,bytes32 simulationHash,uint64 pinnedBlockNumber,bytes32 pinnedBlockHash,address owner,address inputToken,address outputToken,uint128 inputAmount,uint128 inputUsdE8,uint64 deadline,bytes32 nonce)",
);
const HASH = /^0x[0-9a-fA-F]{64}$/;
const CALLDATA = /^0x(?:[0-9a-fA-F]{2}){4,}$/;
const UINT64_MAX = (1n << 64n) - 1n;
const UINT96_MAX = (1n << 96n) - 1n;
const UINT128_MAX = (1n << 128n) - 1n;
const NATIVE_ASSET = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

function assertHash(value: string, label: string): asserts value is Hash {
  if (!HASH.test(value) || /^0x0{64}$/i.test(value)) throw new Error(`${label} must be nonzero bytes32`);
}
function assertAddress(value: string, label: string): asserts value is Address {
  if (!isAddress(value) || /^0x0{40}$/i.test(value)) throw new Error(`${label} must be a nonzero address`);
}
function assertUint(value: bigint, maximum: bigint, label: string) {
  if (value <= 0n || value > maximum) throw new Error(`${label} is out of range`);
}
function assertSortedUnique(values: readonly string[], label: string) {
  const canonical = values.map((value) => value.toLowerCase());
  if (!canonical.every((value, index) => index === 0 || canonical[index - 1]! < value)) {
    throw new Error(`${label} must be sorted and unique`);
  }
}

export function assertExecutionProgramV4(value: ExecutionProgramV4): void {
  [value.policyHash, value.manifestHash, value.canonicalProgramHash, value.inputIdentityEvidenceHash,
    value.outputIdentityEvidenceHash, value.valuationEvidenceHash, value.stageHash, value.simulationHash,
    value.pinnedBlockHash, value.nonce].forEach((hash, index) => assertHash(hash, `hash ${index}`));
  [value.owner, value.inputToken, value.outputToken].forEach((address, index) => assertAddress(address, `address ${index}`));
  assertUint(value.pinnedBlockNumber, UINT64_MAX, "pinnedBlockNumber");
  assertUint(value.inputAmount, UINT128_MAX, "inputAmount");
  assertUint(value.inputUsdE8, UINT128_MAX, "inputUsdE8");
  assertUint(value.deadline, UINT64_MAX, "deadline");
  if (value.sourceChainId !== 1n && value.sourceChainId !== 196n) throw new Error("sourceChainId is unsupported");
  if (value.refundTokens.length > 16 ||
      value.calls.length < 1 || value.calls.length > 8 ||
      value.constraints.length < 1 || value.constraints.length > 8) throw new Error("Program collection count is invalid");
  value.refundTokens.forEach((token) => assertAddress(token, "refund token"));
  assertSortedUnique(value.refundTokens, "Refund tokens");
  const refunds = new Set(value.refundTokens.map((token) => token.toLowerCase()));
  if ((value.inputToken.toLowerCase() !== NATIVE_ASSET && !refunds.has(value.inputToken.toLowerCase())) ||
      (value.outputToken.toLowerCase() !== NATIVE_ASSET && !refunds.has(value.outputToken.toLowerCase()))) {
    throw new Error("Input and output tokens must be refundable");
  }

  let calldataBytes = 0;
  let approvalCount = 0;
  let totalGas = 0;
  for (const call of value.calls) {
    assertHash(call.adapterKey, "adapterKey");
    assertHash(call.targetRuntimeCodeHash, "targetRuntimeCodeHash");
    assertAddress(call.target, "call target");
    if (call.value < 0n || call.value > UINT96_MAX || !Number.isInteger(call.gasLimit) ||
        call.gasLimit < 21_000 || call.gasLimit > 1_000_000 || !CALLDATA.test(call.data)) {
      throw new Error("Call resource bound is invalid");
    }
    calldataBytes += (call.data.length - 2) / 2;
    totalGas += call.gasLimit;
    approvalCount += call.approvals.length;
    const approved = call.approvals.map(({ token, spender }) => `${token.toLowerCase()}:${spender.toLowerCase()}`);
    call.approvals.forEach(({ token, spender }) => {
      assertAddress(token, "approval token");
      assertAddress(spender, "approval spender");
      if (token.toLowerCase() === NATIVE_ASSET) throw new Error("Native assets cannot be approved");
    });
    assertSortedUnique(approved, "Approval token-spender pairs");
    for (const approval of call.approvals) {
      assertUint(approval.amount, UINT128_MAX, "approval amount");
      if (!refunds.has(approval.token.toLowerCase())) throw new Error("Approval token must be refundable");
    }
  }
  if (calldataBytes > 16_384 || totalGas > 4_000_000 || approvalCount > 16) {
    throw new Error("Program resource limit exceeded");
  }

  const constrained = value.constraints.map(({ token }) => token);
  constrained.forEach((token) => assertAddress(token, "constraint token"));
  assertSortedUnique(constrained, "Constraint tokens");
  for (const constraint of value.constraints) {
    assertUint(constraint.minimum, UINT128_MAX, "constraint minimum");
    if (constraint.token.toLowerCase() === NATIVE_ASSET) {
      if (constraint.kind !== 1) throw new Error("Native constraints must measure an increase");
    } else if (!refunds.has(constraint.token.toLowerCase())) {
      throw new Error("Constraint token must be refundable");
    }
  }
  if (!constrained.some((token) => token.toLowerCase() === value.outputToken.toLowerCase())) {
    throw new Error("Output token requires a final constraint");
  }
}

export function executionProgramHashV4(value: ExecutionProgramV4): Hash {
  assertExecutionProgramV4(value);
  return keccak256(encodeAbiParameters(programParameters, [value]));
}

export function buildAuthorizationV4(value: ExecutionProgramV4, executor: Address): VerifierAuthorizationV4 {
  assertAddress(executor, "executor");
  return {
    executor,
    chainId: value.sourceChainId,
    executionCommitment: executionProgramHashV4(value),
    policyHash: value.policyHash,
    manifestHash: value.manifestHash,
    canonicalProgramHash: value.canonicalProgramHash,
    inputIdentityEvidenceHash: value.inputIdentityEvidenceHash,
    outputIdentityEvidenceHash: value.outputIdentityEvidenceHash,
    valuationEvidenceHash: value.valuationEvidenceHash,
    stageHash: value.stageHash,
    simulationHash: value.simulationHash,
    pinnedBlockNumber: value.pinnedBlockNumber,
    pinnedBlockHash: value.pinnedBlockHash,
    owner: value.owner,
    inputToken: value.inputToken,
    outputToken: value.outputToken,
    inputAmount: value.inputAmount,
    inputUsdE8: value.inputUsdE8,
    deadline: value.deadline,
    nonce: value.nonce,
  };
}

export function authorizationPayloadHashV4(value: VerifierAuthorizationV4): Hash {
  return keccak256(encodeAbiParameters(authorizationParameters, [value]));
}
