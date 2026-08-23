import { commitment } from "@cobia/domain";
import { z } from "zod";
import type { Address, Hex } from "viem";

const ChainSchema = z.union([z.literal(1), z.literal(196)]);
const AddressSchema = z.string().regex(/^0x[0-9a-f]{40}$/)
  .refine((value) => !/^0x0{40}$/.test(value))
  .transform((value) => value as Address);
const HashSchema = z.string().regex(/^0x[0-9a-f]{64}$/)
  .refine((value) => !/^0x0{64}$/.test(value))
  .transform((value) => value as Hex);
const PositiveAtomicSchema = z.string().regex(/^[1-9][0-9]*$/);
const HexValueSchema = z.string().regex(/^0x(?:0|[1-9a-f][0-9a-f]*)$/)
  .transform((value) => value as Hex);
const CalldataSchema = z.string().regex(/^0x(?:[0-9a-f]{2}){4,16384}$/)
  .transform((value) => value as Hex);

const WalletStageTransactionSchema = z.object({
  chainId: ChainSchema,
  from: AddressSchema,
  to: AddressSchema,
  value: HexValueSchema,
  data: CalldataSchema,
}).strict();

export interface WalletStageTransactionV4 {
  chainId: 1 | 196;
  from: Address;
  to: Address;
  value: Hex;
  data: Hex;
}

export interface PreparedWalletStageTransactionV4 extends WalletStageTransactionV4 {
  nonce: string;
}

const LogSchema = z.object({
  address: AddressSchema,
  topics: z.array(HashSchema).min(1).max(4),
  data: z.string().regex(/^0x(?:[0-9a-f]{2})*$/).transform((value) => value as Hex),
}).strict();

const DeliverySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }).strict(),
  z.object({
    kind: z.literal("bridge"),
    destinationChainId: ChainSchema,
    recipient: AddressSchema,
    token: AddressSchema,
    minimumAtomic: PositiveAtomicSchema,
  }).strict(),
]);

const StageSchema = z.object({
  stageId: HashSchema,
  ordinal: z.number().int().min(0).max(7),
  chainId: ChainSchema,
  predecessorStageId: HashSchema.nullable(),
  inputToken: AddressSchema,
  requiredConfirmations: z.number().int().min(1).max(256),
  transaction: WalletStageTransactionSchema,
  expectedLogs: z.array(LogSchema).max(64),
  delivery: DeliverySchema,
  evidenceHash: HashSchema,
}).strict();

const BundleSchema = z.object({
  version: z.literal(4),
  kind: z.literal("general-asset-execution"),
  programId: HashSchema,
  owner: AddressSchema,
  deadline: z.number().int().positive().safe(),
  finalOutput: z.object({
    chainId: ChainSchema,
    token: AddressSchema,
    minimumAtomic: PositiveAtomicSchema,
  }).strict(),
  stages: z.array(StageSchema).min(1).max(8),
}).strict().superRefine((bundle, context) => {
  bundle.stages.forEach((stage, index) => {
    const predecessor = index === 0 ? null : bundle.stages[index - 1]!.stageId;
    if (stage.ordinal !== index || stage.predecessorStageId !== predecessor) {
      context.addIssue({ code: "custom", path: ["stages", index], message: "Stages are not ordered" });
    }
    if (stage.transaction.chainId !== stage.chainId || stage.transaction.from !== bundle.owner) {
      context.addIssue({ code: "custom", path: ["stages", index, "transaction"],
        message: "Stage transaction does not match chain and owner" });
    }
    const next = bundle.stages[index + 1];
    if (next) {
      if (stage.delivery.kind !== "bridge" ||
          stage.delivery.destinationChainId !== next.chainId ||
          stage.delivery.recipient !== bundle.owner || stage.delivery.token !== next.inputToken) {
        context.addIssue({ code: "custom", path: ["stages", index, "delivery"],
          message: "Bridge does not bind the next stage" });
      }
    } else if (stage.delivery.kind !== "none" || stage.chainId !== bundle.finalOutput.chainId) {
      context.addIssue({ code: "custom", path: ["finalOutput"], message: "Final stage is invalid" });
    }
  });
});

export type GeneralAssetExecutionBundleV4 = z.infer<typeof BundleSchema>;

export function parseGeneralAssetExecutionBundleV4(value: unknown): GeneralAssetExecutionBundleV4 {
  return BundleSchema.parse(value);
}

export function assertExactStageTransaction(
  attested: WalletStageTransactionV4,
  proposed: PreparedWalletStageTransactionV4,
): void {
  const { nonce, ...exact } = proposed;
  if (!/^(0|[1-9][0-9]*)$/.test(nonce) || commitment(attested) !== commitment(exact)) {
    throw new Error("Wallet transaction does not match attestation");
  }
}
