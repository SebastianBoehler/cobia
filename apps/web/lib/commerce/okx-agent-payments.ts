import { isAddress, type Address, type Hash } from "viem";
import { z } from "zod";

const AddressSchema = z.string().refine(isAddress).transform((value) => value.toLowerCase() as Address);
const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((value) => value.toLowerCase() as Hash);
const PaymentIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const AtomicAmountSchema = z.string().regex(/^[1-9][0-9]*$/).max(78);
const TimestampSchema = z.string().datetime({ offset: true });

const PaymentDetailSchema = z.object({
  code: z.literal("0"),
  msg: z.string().optional(),
  data: z.object({
    paymentId: PaymentIdSchema,
    status: z.string().min(1),
    createdAt: TimestampSchema,
    expiresAt: TimestampSchema,
    challenge: z.object({
      type: z.literal("payment-challenge"),
      data: z.object({
        id: PaymentIdSchema,
        realm: z.string().min(1),
        method: z.literal("evm"),
        intent: z.literal("charge"),
        request: z.object({
          amount: AtomicAmountSchema,
          currency: AddressSchema,
          recipient: AddressSchema,
          methodDetails: z.object({
            chainId: z.literal(196),
            authorizationType: z.literal("eip-3009"),
          }).strict(),
        }).passthrough(),
        expires: TimestampSchema,
      }).passthrough(),
    }).strict(),
  }).strict(),
}).strict();

const PaymentStatusSchema = z.object({
  code: z.literal("0"),
  msg: z.string().optional(),
  data: z.object({
    paymentId: PaymentIdSchema,
    status: z.string().min(1),
    executed: z.object({
      txHash: HashSchema,
      blockNumber: z.number().int().positive(),
      blockTimestamp: TimestampSchema,
    }).strict().optional(),
    fee: z.object({
      amount: z.string().regex(/^[0-9]+$/).max(78),
      bps: z.number().int().min(0).max(10_000),
    }).strict().optional(),
    failureReason: z.string().min(1).nullable().optional(),
  }).strict(),
}).strict();

export interface OkxAgentPaymentsClient {
  getPaymentDetail(paymentId: string): Promise<unknown>;
  getPaymentStatus(paymentId: string): Promise<unknown>;
}

export function parseOkxAgentPaymentReferenceV1(reference: string): string {
  try {
    const url = new URL(reference);
    if (url.protocol !== "https:" || url.hostname !== "pay.okx.com" || url.username || url.password ||
      url.search || url.hash) throw new Error("invalid reference");
    return PaymentIdSchema.parse(url.pathname.match(/^\/p\/([^/]+)$/)?.[1]);
  } catch {
    throw new Error("OKX Agent Payment link is invalid");
  }
}

export async function readOkxAgentPaymentV1(input: {
  reference: string;
  client: OkxAgentPaymentsClient;
}) {
  const paymentId = parseOkxAgentPaymentReferenceV1(input.reference);
  const detail = PaymentDetailSchema.parse(await input.client.getPaymentDetail(paymentId)).data;
  if (detail.paymentId !== paymentId || detail.challenge.data.id !== paymentId) {
    throw new Error("OKX Agent Payment identifiers do not match the reference");
  }
  const status = PaymentStatusSchema.parse(await input.client.getPaymentStatus(paymentId)).data;
  if (status.paymentId !== paymentId) throw new Error("OKX Agent Payment status does not match the reference");
  const settlement = status.executed && status.fee ? {
    transactionHash: status.executed.txHash,
    blockNumber: status.executed.blockNumber,
    blockTimestamp: status.executed.blockTimestamp,
    feeAtomicAmount: status.fee.amount,
    feeBps: status.fee.bps,
  } : null;
  return {
    provider: { id: "okx-agent-payments", displayName: "OKX Agent Payments" },
    paymentId,
    status: status.status,
    realm: detail.challenge.data.realm,
    createdAt: detail.createdAt,
    expiresAt: detail.expiresAt,
    payment: {
      chainId: detail.challenge.data.request.methodDetails.chainId,
      atomicAmount: detail.challenge.data.request.amount,
      asset: detail.challenge.data.request.currency,
      recipient: detail.challenge.data.request.recipient,
      authorizationType: detail.challenge.data.request.methodDetails.authorizationType,
    },
    settlement,
    failureReason: status.failureReason ?? null,
  };
}
