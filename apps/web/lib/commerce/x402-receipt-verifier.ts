import { commitment } from "@cobia/domain";
import {
  encodeFunctionData,
  isAddress,
  isAddressEqual,
  padHex,
  parseSignature,
  toHex,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { z } from "zod";
import {
  finalizeX402PaymentV2,
  X402AuthorizationTemplateV1Schema,
} from "./x402-authorization";
import { X402AuthorizationPlanV1Schema } from "./x402-plan";
import { X402SettlementResponseV2Schema } from "./x402-resource-client";

const AddressSchema = z.string().refine(isAddress).transform(
  (value) => value.toLowerCase() as Address,
);
const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(
  (value) => value.toLowerCase() as Hash,
).refine((value) => !/^0x0{64}$/.test(value));
const HexSchema = z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/).transform(
  (value) => value.toLowerCase() as Hex,
);
const PositiveAtomicSchema = z.string().regex(/^[1-9][0-9]*$/).max(78);

const TransactionSchema = z.object({
  hash: HashSchema, to: AddressSchema, input: HexSchema,
  blockNumber: PositiveAtomicSchema, blockHash: HashSchema,
  blockTimestampSec: z.number().int().positive().safe(),
}).strict();
const ReceiptSchema = z.object({
  transactionHash: HashSchema, status: z.literal("success"),
  blockNumber: PositiveAtomicSchema, blockHash: HashSchema,
  logs: z.array(z.object({
    address: AddressSchema, topics: z.array(HashSchema).min(1).max(4), data: HexSchema,
  }).strict()).max(256),
}).strict();

const TRANSFER_WITH_AUTHORIZATION_ABI = [{
  type: "function", name: "transferWithAuthorization", stateMutability: "nonpayable",
  inputs: [
    { name: "from", type: "address" }, { name: "to", type: "address" },
    { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
    { name: "v", type: "uint8" }, { name: "r", type: "bytes32" }, { name: "s", type: "bytes32" },
  ], outputs: [],
}] as const;

export type X402ReceiptRejectionCodeV1 =
  | "PAYMENT_AUTH_MISMATCH" | "PAYMENT_SETTLEMENT_MISMATCH"
  | "PAYMENT_SETTLEMENT_REORGED" | "PAYMENT_SETTLEMENT_UNCONFIRMED"
  | "PAYMENT_TRANSFER_MISSING" | "TARGET_CODE_MISMATCH";

export async function verifyX402SettlementReceiptV1(raw: {
  plan: unknown; template: unknown; signature: unknown; settlement: unknown;
  transaction: unknown; receipt: unknown; latestBlockNumber: string; minimumConfirmations: number;
  confirmAnchor(block: { number: string; hash: Hash }): Promise<boolean>;
  readCodeHash(address: Address, block: { number: string; hash: Hash }): Promise<Hash>;
}) {
  const errors = new Set<X402ReceiptRejectionCodeV1>();
  let parsed: {
    plan: ReturnType<typeof X402AuthorizationPlanV1Schema.parse>;
    template: ReturnType<typeof X402AuthorizationTemplateV1Schema.parse>;
    settlement: ReturnType<typeof X402SettlementResponseV2Schema.parse>;
    transaction: ReturnType<typeof TransactionSchema.parse>;
    receipt: ReturnType<typeof ReceiptSchema.parse>;
  };
  try {
    parsed = {
      plan: X402AuthorizationPlanV1Schema.parse(raw.plan),
      template: X402AuthorizationTemplateV1Schema.parse(raw.template),
      settlement: X402SettlementResponseV2Schema.parse(raw.settlement),
      transaction: TransactionSchema.parse(raw.transaction),
      receipt: ReceiptSchema.parse(raw.receipt),
    };
  } catch {
    return { accepted: false, errorCodes: ["PAYMENT_SETTLEMENT_MISMATCH"] as X402ReceiptRejectionCodeV1[], evidence: null };
  }
  const { plan, template, settlement, transaction, receipt } = parsed;
  try { await finalizeX402PaymentV2({ expected: template, submitted: template, signature: raw.signature }); } catch {
    errors.add("PAYMENT_AUTH_MISMATCH");
  }
  if (template.planHash !== commitment(plan) || settlement.transaction !== transaction.hash ||
    !isAddressEqual(settlement.payer, plan.owner) || settlement.amount !== plan.amount ||
    transaction.hash !== receipt.transactionHash || transaction.blockNumber !== receipt.blockNumber ||
    transaction.blockHash !== receipt.blockHash || !isAddressEqual(transaction.to, plan.asset) ||
    transaction.blockTimestampSec < Number(template.authorization.validAfter) ||
    transaction.blockTimestampSec >= Number(template.authorization.validBefore)) {
    errors.add("PAYMENT_SETTLEMENT_MISMATCH");
  }
  try {
    const signature = parseSignature(z.string().regex(/^0x[0-9a-fA-F]{130}$/).parse(raw.signature) as Hex);
    const expectedInput = encodeFunctionData({
      abi: TRANSFER_WITH_AUTHORIZATION_ABI, functionName: "transferWithAuthorization",
      args: [
        plan.owner, plan.payee, BigInt(plan.amount), BigInt(template.authorization.validAfter),
        BigInt(template.authorization.validBefore), plan.authorizationNonce,
        Number(signature.v), signature.r, signature.s,
      ],
    });
    if (transaction.input !== expectedInput.toLowerCase()) errors.add("PAYMENT_SETTLEMENT_MISMATCH");
  } catch { errors.add("PAYMENT_SETTLEMENT_MISMATCH"); }

  const transfers = receipt.logs.filter((log) => isAddressEqual(log.address, plan.asset) &&
    log.topics[0] === plan.settlement.topic0);
  if (transfers.length === 0) errors.add("PAYMENT_TRANSFER_MISSING");
  const transfer = transfers[0];
  if (transfers.length !== 1 || !transfer ||
    transfer.topics[plan.settlement.fromTopicIndex] !== padHex(plan.owner, { size: 32 }).toLowerCase() ||
    transfer.topics[plan.settlement.toTopicIndex] !== padHex(plan.payee, { size: 32 }).toLowerCase() ||
    transfer.data !== padHex(toHex(BigInt(plan.amount)), { size: 32 }).toLowerCase()) {
    errors.add("PAYMENT_SETTLEMENT_MISMATCH");
  }

  const latest = z.string().regex(/^[1-9][0-9]*$/).parse(raw.latestBlockNumber);
  const confirmations = BigInt(latest) - BigInt(transaction.blockNumber) + 1n;
  const minimumConfirmations = z.number().int().min(1).max(64).parse(raw.minimumConfirmations);
  if (confirmations < BigInt(minimumConfirmations)) errors.add("PAYMENT_SETTLEMENT_UNCONFIRMED");
  const anchor = { number: transaction.blockNumber, hash: transaction.blockHash };
  try {
    if (!(await raw.confirmAnchor(anchor))) errors.add("PAYMENT_SETTLEMENT_REORGED");
  } catch { errors.add("PAYMENT_SETTLEMENT_REORGED"); }
  try {
    if (await raw.readCodeHash(plan.asset, anchor) !== plan.token.runtimeCodeHash) {
      errors.add("TARGET_CODE_MISMATCH");
    }
  } catch { errors.add("TARGET_CODE_MISMATCH"); }
  const evidence = errors.size === 0 ? {
    version: 1 as const, chainId: 196 as const, transactionHash: transaction.hash,
    blockNumber: transaction.blockNumber, blockHash: transaction.blockHash,
    planHash: commitment(plan), settlementHash: commitment(settlement),
    receiptHash: commitment(receipt), confirmations: confirmations.toString(),
  } : null;
  return { accepted: errors.size === 0, errorCodes: [...errors].sort(), evidence };
}
