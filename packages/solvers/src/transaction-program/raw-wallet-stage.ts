import { TransactionStageV1Schema, type TransactionStageV1 } from "@cobia/domain";
import {
  encodeFunctionData,
  erc20Abi,
  isAddress,
  keccak256,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { z } from "zod";

const AddressSchema = z.string().refine(isAddress).refine(
  (value) => value === value.toLowerCase(),
  "Addresses must use lowercase canonical form",
).transform((value) => value as Address);
const CalldataSchema = z.string().regex(/^0x[0-9a-f]{8}(?:[0-9a-f]{2})*$/).transform(
  (value) => value as Hex,
);
const AtomicSchema = z.string().regex(/^(0|[1-9][0-9]*)$/).max(78);

export const RawWalletArtifactV1Schema = z.object({
  version: z.literal(1),
  provider: z.literal("evm.raw@1"),
  stageId: z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/).max(96),
  transaction: z.object({
    chainId: z.union([z.literal(1), z.literal(196)]),
    from: AddressSchema,
    to: AddressSchema,
    data: CalldataSchema,
    valueAtomic: AtomicSchema,
  }).strict(),
}).strict();

export interface UnsignedWalletCallV1 {
  to: Address;
  data: Hex;
  value: Hex;
}

export type RawWalletStageVerificationV1 =
  | { accepted: false; errorCodes: string[] }
  | { accepted: true; calls: UnsignedWalletCallV1[] };

function reject(...errorCodes: string[]): RawWalletStageVerificationV1 {
  return { accepted: false, errorCodes: [...new Set(errorCodes)].sort() };
}

function walletStage(input: unknown): Extract<TransactionStageV1, { kind: "wallet-transaction" }> | undefined {
  const result = TransactionStageV1Schema.safeParse(input);
  return result.success && result.data.kind === "wallet-transaction" ? result.data : undefined;
}

export function verifyRawWalletStageV1(input: {
  stage: unknown;
  artifact: unknown;
  currentAllowanceAtomic: unknown;
}): RawWalletStageVerificationV1 {
  const stage = walletStage(input.stage);
  const artifact = RawWalletArtifactV1Schema.safeParse(input.artifact);
  const allowance = AtomicSchema.safeParse(input.currentAllowanceAtomic);
  if (!stage || !artifact.success || !allowance.success) return reject("RAW_ARTIFACT_INVALID");
  if (stage.provider !== "evm.raw@1") return reject("RAW_PROVIDER_MISMATCH");

  const transaction = artifact.data.transaction;
  const errors: string[] = [];
  if (artifact.data.stageId !== stage.id) errors.push("RAW_STAGE_MISMATCH");
  if (transaction.chainId !== stage.chainId) errors.push("RAW_CHAIN_MISMATCH");
  if (transaction.from !== stage.sender) errors.push("RAW_SENDER_MISMATCH");
  if (transaction.to !== stage.transaction.target) errors.push("RAW_TARGET_MISMATCH");
  if (transaction.data.slice(0, 10) !== stage.transaction.selector) errors.push("RAW_SELECTOR_MISMATCH");
  if (keccak256(transaction.data) !== stage.transaction.dataHash) errors.push("RAW_CALLDATA_MISMATCH");
  if (transaction.valueAtomic !== stage.transaction.valueAtomic) errors.push("RAW_VALUE_MISMATCH");
  if (errors.length) return reject(...errors);

  const calls: UnsignedWalletCallV1[] = [];
  if (stage.approval) {
    if (BigInt(allowance.data) > 0n) {
      calls.push({
        to: stage.approval.token,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [stage.approval.spender, 0n],
        }),
        value: "0x0",
      });
    }
    calls.push({
      to: stage.approval.token,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [stage.approval.spender, BigInt(stage.approval.maximumAtomic)],
      }),
      value: "0x0",
    });
  }
  calls.push({
    to: transaction.to,
    data: transaction.data,
    value: toHex(BigInt(transaction.valueAtomic)),
  });
  return { accepted: true, calls };
}
