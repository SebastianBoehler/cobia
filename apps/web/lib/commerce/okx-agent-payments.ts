import { isAddress, type Address, type Hash } from "viem";
import { z } from "zod";

const PaymentIdSchema = z.string().regex(/^a2a_[0-9A-Za-z]{20,64}$/);
const AtomicAmountSchema = z.string().regex(/^[1-9][0-9]*$/).max(78);
const AddressSchema = z.string().refine(isAddress).transform(
  (value) => value.toLowerCase() as Address,
);
const TimestampSchema = z.string().datetime({ offset: true });
const StatusSchema = z.enum(["pending", "settling", "completed", "failed", "expired"]);

const ChallengeSchema = z.object({
  type: z.literal("payment-challenge"),
  data: z.object({
    id: PaymentIdSchema,
    realm: z.string().min(1).max(253),
    method: z.literal("evm"),
    intent: z.literal("charge"),
    request: z.object({
      amount: AtomicAmountSchema,
      currency: AddressSchema,
      recipient: AddressSchema,
      description: z.string().max(2_000).optional(),
      externalId: z.string().max(256).optional(),
      methodDetails: z.object({
        chainId: z.literal(196),
        authorizationType: z.literal("eip-3009"),
      }).strict(),
    }).strict(),
    expires: TimestampSchema,
  }).strict(),
}).strict();

const DetailEnvelopeSchema = z.object({
  code: z.literal("0"),
  msg: z.string().max(256),
  data: z.object({
    paymentId: PaymentIdSchema,
    status: StatusSchema,
    createdAt: TimestampSchema,
    expiresAt: TimestampSchema,
    challenge: ChallengeSchema,
  }).strict(),
}).strict();

const ExecutionSchema = z.object({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((value) => value.toLowerCase() as Hash),
  blockNumber: z.number().int().positive(),
  blockTimestamp: TimestampSchema,
}).strict();
const FeeSchema = z.object({
  amount: z.string().regex(/^[0-9]+$/).max(78),
  bps: z.number().int().min(0).max(10_000),
}).strict();

const StatusDataSchema = z.discriminatedUnion("status", [
  z.object({ paymentId: PaymentIdSchema, status: z.literal("pending") }).strict(),
  z.object({ paymentId: PaymentIdSchema, status: z.literal("settling") }).strict(),
  z.object({ paymentId: PaymentIdSchema, status: z.literal("expired") }).strict(),
  z.object({
    paymentId: PaymentIdSchema,
    status: z.literal("completed"),
    executed: ExecutionSchema,
    fee: FeeSchema.optional(),
  }).strict(),
  z.object({
    paymentId: PaymentIdSchema,
    status: z.literal("failed"),
    failure: z.object({
      reason: z.string().min(1).max(128),
      message: z.string().max(1_000),
    }).strict(),
  }).strict(),
]);

const StatusEnvelopeSchema = z.object({
  code: z.literal("0"),
  msg: z.string().max(256),
  data: StatusDataSchema,
}).strict();

export type OkxAgentPaymentErrorCodeV1 =
  | "INVALID_REFERENCE"
  | "PAYMENT_NOT_FOUND"
  | "PROVIDER_REJECTED"
  | "PROVIDER_RESPONSE_INVALID";

export class OkxAgentPaymentErrorV1 extends Error {
  constructor(public readonly code: OkxAgentPaymentErrorCodeV1, message: string) {
    super(message);
    this.name = "OkxAgentPaymentErrorV1";
  }
}

const EnvelopeHeadSchema = z.object({
  code: z.union([z.string(), z.number().int().safe()]),
  msg: z.string().max(256).optional(),
  data: z.unknown(),
}).passthrough();

function normalizeEnvelope(input: unknown, detail: boolean): unknown {
  const head = EnvelopeHeadSchema.safeParse(input);
  if (!head.success) {
    throw new OkxAgentPaymentErrorV1("PROVIDER_RESPONSE_INVALID", "OKX returned an invalid response");
  }
  const code = String(head.data.code);
  const data = head.data.data;
  if (detail && typeof data === "object" && data !== null && "available" in data &&
    (data as { available?: unknown }).available === false) {
    throw new OkxAgentPaymentErrorV1("PAYMENT_NOT_FOUND", "OKX Agent Payment was not found");
  }
  if (code !== "0") {
    throw new OkxAgentPaymentErrorV1("PROVIDER_REJECTED", `OKX rejected the payment lookup (${code})`);
  }
  return { ...head.data, code, msg: head.data.msg ?? "" };
}

export interface OkxAgentPaymentsClientV1 {
  getPaymentDetail(paymentId: string): Promise<unknown>;
  getPaymentStatus(paymentId: string): Promise<unknown>;
}

export type OkxAgentPaymentSnapshotV1 = {
  provider: { id: "okx-agent-payments"; displayName: "OKX Agent Payments" };
  paymentId: string;
  status: z.infer<typeof StatusSchema>;
  realm: string;
  createdAt: string;
  expiresAt: string;
  payment: {
    chainId: 196;
    atomicAmount: string;
    asset: Address;
    recipient: Address;
    authorizationType: "eip-3009";
  };
  settlement: {
    transactionHash: Hash;
    blockNumber: number;
    blockTimestamp: string;
    feeAtomicAmount: string | null;
    feeBps: number | null;
  } | null;
  failureReason: string | null;
};

export function parseOkxAgentPaymentReferenceV1(reference: string): string {
  const direct = PaymentIdSchema.safeParse(reference.trim());
  if (direct.success) return direct.data;
  let url: URL;
  try {
    url = new URL(reference.trim());
  } catch {
    throw new OkxAgentPaymentErrorV1("INVALID_REFERENCE", "OKX Agent Payment reference is invalid");
  }
  if (url.protocol !== "https:" || url.hostname !== "pay.okx.com" || url.username || url.password ||
    url.search || url.hash) {
    throw new OkxAgentPaymentErrorV1("INVALID_REFERENCE", "OKX Agent Payment reference is invalid");
  }
  const match = url.pathname.match(/^\/p\/(a2a_[0-9A-Za-z]{20,64})\/?$/);
  if (!match?.[1]) throw new OkxAgentPaymentErrorV1("INVALID_REFERENCE", "OKX Agent Payment reference is invalid");
  try { return PaymentIdSchema.parse(match[1]); } catch {
    throw new OkxAgentPaymentErrorV1("INVALID_REFERENCE", "OKX Agent Payment reference is invalid");
  }
}

export async function readOkxAgentPaymentV1(input: {
  reference: string;
  client: OkxAgentPaymentsClientV1;
}): Promise<OkxAgentPaymentSnapshotV1> {
  const paymentId = parseOkxAgentPaymentReferenceV1(input.reference);
  const detailEnvelope = normalizeEnvelope(await input.client.getPaymentDetail(paymentId), true);
  let detail: z.infer<typeof DetailEnvelopeSchema>["data"];
  try {
    detail = DetailEnvelopeSchema.parse(detailEnvelope).data;
  } catch {
    throw new OkxAgentPaymentErrorV1("PROVIDER_RESPONSE_INVALID", "OKX returned invalid payment details");
  }
  const statusEnvelope = normalizeEnvelope(await input.client.getPaymentStatus(paymentId), false);
  let status: z.infer<typeof StatusDataSchema>;
  try {
    status = StatusEnvelopeSchema.parse(statusEnvelope).data;
  } catch {
    throw new OkxAgentPaymentErrorV1("PROVIDER_RESPONSE_INVALID", "OKX returned an invalid payment status");
  }
  if (detail.paymentId !== paymentId || detail.challenge.data.id !== paymentId || status.paymentId !== paymentId) {
    throw new Error("OKX Agent Payment identity mismatch");
  }
  if (detail.expiresAt !== detail.challenge.data.expires) {
    throw new Error("OKX Agent Payment expiry mismatch");
  }
  const request = detail.challenge.data.request;
  const completed = status.status === "completed" ? status : null;
  return {
    provider: { id: "okx-agent-payments", displayName: "OKX Agent Payments" },
    paymentId,
    status: status.status,
    realm: detail.challenge.data.realm,
    createdAt: detail.createdAt,
    expiresAt: detail.expiresAt,
    payment: {
      chainId: 196,
      atomicAmount: request.amount,
      asset: request.currency,
      recipient: request.recipient,
      authorizationType: "eip-3009",
    },
    settlement: completed ? {
      transactionHash: completed.executed.txHash,
      blockNumber: completed.executed.blockNumber,
      blockTimestamp: completed.executed.blockTimestamp,
      feeAtomicAmount: completed.fee?.amount ?? null,
      feeBps: completed.fee?.bps ?? null,
    } : null,
    failureReason: status.status === "failed" ? status.failure.reason : null,
  };
}
