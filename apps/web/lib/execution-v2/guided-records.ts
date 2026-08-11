import { commitment } from "@cobia/domain";
import { isAddress, type Address, type Hash, type Hex } from "viem";
import { z } from "zod";
import type {
  CapturedExecutionStateV2,
  ConfirmedOwnerTransactionV2,
  ExecutionProtocolEvidenceV2,
  ExecutionStateCheckV2,
} from "./engine-types";
import type { GuidedPreparedStepV2 } from "./guided-session";
import type { GuidedFundingPreflightV2 } from "./execution-preflight";
import type { ExecutionStepLabelV2 } from "./types";

const Atomic = z.string().regex(/^(0|[1-9][0-9]*)$/).transform(BigInt);
const PositiveAtomic = z.string().regex(/^[1-9][0-9]*$/).transform(BigInt);
const AddressSchema = z.string().refine(isAddress)
  .transform((value) => value.toLowerCase() as Address);
const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((value) => value.toLowerCase() as Hash);
const DataSchema = z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/)
  .transform((value) => value.toLowerCase() as Hex);
const LabelSchema = z.enum([
  "reset-aave-allowance", "approve-aave-exact", "aave-v3-supply",
  "reset-uniswap-allowance", "approve-uniswap-exact", "uniswap-v3-exact-input",
]);

const CapturedStateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("allowance"), token: AddressSchema, spender: AddressSchema,
    expectedAtomic: Atomic, beforeAtomic: Atomic,
  }).strict(),
  z.object({
    kind: z.literal("swap"), tokenIn: AddressSchema, tokenOut: AddressSchema,
    amountInAtomic: PositiveAtomic, minimumOutputAtomic: PositiveAtomic,
    beforeInputAtomic: Atomic, beforeOutputAtomic: Atomic,
  }).strict(),
  z.object({
    kind: z.literal("aave-supply"), asset: AddressSchema, aToken: AddressSchema,
    suppliedAtomic: PositiveAtomic, beforeInputAtomic: Atomic,
    scaledATokenBeforeAtomic: Atomic, normalizedIncomeBeforeRay: PositiveAtomic,
  }).strict(),
]);

const EvidenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("approval"), owner: AddressSchema, spender: AddressSchema,
    amountAtomic: Atomic }).strict(),
  z.object({ kind: z.literal("swap"), sender: AddressSchema, recipient: AddressSchema,
    inputAtomic: PositiveAtomic, outputAtomic: PositiveAtomic }).strict(),
  z.object({ kind: z.literal("aave-supply"), suppliedAtomic: PositiveAtomic,
    mintValueAtomic: PositiveAtomic, mintBalanceIncreaseAtomic: Atomic,
    mintIndexRay: PositiveAtomic }).strict(),
]);

const StateCheckSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("allowance"), token: AddressSchema, spender: AddressSchema,
    beforeAtomic: Atomic, afterAtomic: Atomic, expectedAtomic: Atomic }).strict(),
  z.object({ kind: z.literal("swap"), tokenIn: AddressSchema, tokenOut: AddressSchema,
    inputSpentAtomic: PositiveAtomic, outputDeltaAtomic: PositiveAtomic,
    ownerOutputBalanceDeltaAtomic: PositiveAtomic, minimumOutputAtomic: PositiveAtomic }).strict(),
  z.object({ kind: z.literal("aave-supply"), asset: AddressSchema, aToken: AddressSchema,
    inputSpentAtomic: PositiveAtomic, suppliedAtomic: PositiveAtomic,
    scaledATokenDeltaAtomic: PositiveAtomic, normalizedIncomeBeforeRay: PositiveAtomic,
    normalizedIncomeAfterRay: PositiveAtomic }).strict(),
]);

const PreparedSemanticSchema = z.object({
  version: z.literal(1), label: LabelSchema,
  phase: z.enum(["initial", "post-swap"]),
  authorizedAmountAtomic: PositiveAtomic,
  capturedState: CapturedStateSchema,
  funding: z.object({
    asset: AddressSchema,
    requiredTokenAtomic: Atomic,
    tokenBalanceAtomic: Atomic,
    gasPriceAtomic: PositiveAtomic,
    requiredGasAtomic: PositiveAtomic,
    nativeBalanceAtomic: Atomic,
  }).strict().optional(),
}).strict();

const ConfirmedReceiptSchema = z.object({
  version: z.literal(1), label: LabelSchema, hash: HashSchema,
  preBlockNumber: Atomic, preBlockHash: HashSchema,
  blockNumber: PositiveAtomic, blockHash: HashSchema,
  transactionIndex: z.number().int().nonnegative(), status: z.literal("success"),
  gasEstimate: Atomic,
}).strict();

function jsonAtomic<T>(value: T): T {
  if (typeof value === "bigint") return value.toString() as T;
  if (Array.isArray(value)) return value.map(jsonAtomic) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, jsonAtomic(item)])) as T;
  }
  return value;
}

function stepKind(label: ExecutionStepLabelV2) {
  if (label.includes("allowance") || label.startsWith("approve-")) return "approval" as const;
  if (label === "uniswap-v3-exact-input") return "swap" as const;
  return "supply" as const;
}

export function preparedStepRecordV2(
  attemptId: string,
  ordinal: number,
  prepared: GuidedPreparedStepV2,
  funding?: GuidedFundingPreflightV2,
) {
  const semantic = {
    version: 1 as const,
    label: prepared.transaction.label,
    phase: prepared.phase,
    authorizedAmountAtomic: prepared.authorizedAmountAtomic.toString(),
    capturedState: jsonAtomic(prepared.capturedState),
    ...(funding ? { funding: jsonAtomic(funding) } : {}),
  };
  return {
    attemptId,
    ordinal,
    kind: stepKind(prepared.transaction.label),
    from: prepared.transaction.from,
    to: prepared.transaction.to,
    valueAtomic: prepared.transaction.value.toString(),
    data: prepared.transaction.data,
    calldataHash: commitment(prepared.transaction.data),
    semantic,
    preBlockNumber: prepared.preBlockNumber.toString(),
    preBlockHash: prepared.preBlockHash,
    expectedNonce: prepared.expectedNonce.toString(),
    gasEstimateAtomic: prepared.gasEstimate.toString(),
  };
}

export function parseGuidedPreparedStepV2(row: Record<string, unknown>): GuidedPreparedStepV2 {
  const semantic = PreparedSemanticSchema.parse(row.semantic);
  if (Atomic.parse(row.valueAtomic) !== 0n) {
    throw new Error("Persisted execution value must be zero");
  }
  const prepared = {
    kind: "prepared" as const,
    phase: semantic.phase,
    transaction: Object.freeze({
      label: semantic.label,
      chainId: 196 as const,
      from: AddressSchema.parse(row.from),
      to: AddressSchema.parse(row.to),
      value: 0n as const,
      data: DataSchema.parse(row.calldata ?? row.data),
    }),
    capturedState: Object.freeze(semantic.capturedState) as CapturedExecutionStateV2,
    authorizedAmountAtomic: semantic.authorizedAmountAtomic,
    preBlockNumber: Atomic.parse(row.preBlockNumber),
    preBlockHash: HashSchema.parse(row.preBlockHash),
    expectedNonce: Atomic.parse(row.expectedNonce),
    gasEstimate: Atomic.parse(row.gasEstimateAtomic),
  };
  if (commitment(prepared.transaction.data) !== HashSchema.parse(row.calldataHash)) {
    throw new Error("Persisted execution calldata hash does not match");
  }
  return Object.freeze(prepared);
}

export function confirmedStepRecordV2(
  transaction: ConfirmedOwnerTransactionV2,
  complete: boolean,
) {
  return {
    transactionHash: transaction.hash,
    receipt: jsonAtomic({
      version: 1, label: transaction.label, hash: transaction.hash,
      preBlockNumber: transaction.preBlockNumber,
      preBlockHash: transaction.preBlockHash,
      blockNumber: transaction.blockNumber,
      blockHash: transaction.blockHash,
      transactionIndex: transaction.transactionIndex,
      status: transaction.status,
      gasEstimate: transaction.gasEstimate,
    }),
    evidence: jsonAtomic(transaction.protocolEvidence),
    postcondition: jsonAtomic(transaction.stateCheck),
    complete,
  };
}

export function parseConfirmedExecutionStepsV2(
  rows: readonly Record<string, unknown>[],
): ConfirmedOwnerTransactionV2[] {
  return rows.map((row) => {
    if (row.state !== "confirmed") throw new Error("Execution step is not confirmed");
    const receipt = ConfirmedReceiptSchema.parse(row.receipt);
    const hash = HashSchema.parse(row.transactionHash);
    if (hash !== receipt.hash) throw new Error("Confirmed transaction hash conflicts");
    return Object.freeze({
      label: receipt.label,
      hash,
      preBlockNumber: receipt.preBlockNumber,
      preBlockHash: receipt.preBlockHash,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      transactionIndex: receipt.transactionIndex,
      status: receipt.status,
      gasEstimate: receipt.gasEstimate,
      protocolEvidence: Object.freeze(EvidenceSchema.parse(row.evidence)) as ExecutionProtocolEvidenceV2,
      stateCheck: Object.freeze(StateCheckSchema.parse(row.postcondition)) as ExecutionStateCheckV2,
    });
  });
}
