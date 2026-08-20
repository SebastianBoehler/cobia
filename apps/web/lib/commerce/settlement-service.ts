import { commitment } from "@cobia/domain";
import { isAddress, isAddressEqual, type Address, type Hash } from "viem";
import { z } from "zod";
import { X402AuthorizationTemplateV1Schema } from "./x402-authorization";
import { X402AuthorizationPlanV1Schema } from "./x402-plan";
import { X402SettlementResponseV2Schema } from "./x402-resource-client";

const AddressSchema = z.string().refine(isAddress).transform(
  (value) => value.toLowerCase() as Address,
);
const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(
  (value) => value.toLowerCase() as Hash,
);
const PlacementSchema = z.object({
  id: z.string().uuid(), owner: AddressSchema,
  state: z.enum(["prepared", "authorizing", "submitted", "confirmed", "rejected"]),
  offerCommitment: HashSchema, policyHash: HashSchema, programHash: HashSchema,
  planHash: HashSchema, authorizationTemplateHash: HashSchema,
  authorizationHash: HashSchema, transactionHash: HashSchema,
  updatedAt: z.date().optional(),
}).passthrough();

export type CommerceSettlementErrorCodeV1 =
  | "PLACEMENT_NOT_FOUND" | "PLACEMENT_MISMATCH"
  | "SETTLEMENT_PENDING" | "SETTLEMENT_REJECTED";

export class CommerceSettlementErrorV1 extends Error {
  constructor(
    readonly code: CommerceSettlementErrorCodeV1,
    message: string,
    readonly details: readonly string[] = [],
  ) {
    super(message);
  }
}

export async function confirmCommerceSettlementV1(
  raw: {
    placementId: unknown; plan: unknown; template: unknown;
    signature: unknown; settlement: unknown;
  },
  dependencies: {
    nowSec: number;
    placements: {
      read(id: string): Promise<unknown>;
      append(event: Record<string, unknown>): Promise<unknown>;
    };
    verify(input: {
      plan: unknown; template: unknown; signature: unknown; settlement: unknown;
    }): Promise<{ accepted: boolean; errorCodes: readonly string[]; evidence: unknown }>;
  },
) {
  const placementId = z.string().uuid().parse(raw.placementId);
  const plan = X402AuthorizationPlanV1Schema.parse(raw.plan);
  const template = X402AuthorizationTemplateV1Schema.parse(raw.template);
  const settlement = X402SettlementResponseV2Schema.parse(raw.settlement);
  const storedValue = await dependencies.placements.read(placementId);
  if (!storedValue) {
    throw new CommerceSettlementErrorV1("PLACEMENT_NOT_FOUND", "Commerce placement was not found");
  }
  const stored = PlacementSchema.parse(storedValue);
  const eventTime = Math.max(
    dependencies.nowSec,
    stored.updatedAt ? Math.floor(stored.updatedAt.getTime() / 1_000) + 1 : dependencies.nowSec,
  );
  if (stored.id !== placementId || stored.state !== "submitted" ||
    !isAddressEqual(stored.owner, plan.owner) || stored.offerCommitment !== plan.offerCommitment ||
    stored.policyHash !== plan.policyHash || stored.programHash !== plan.programHash ||
    stored.planHash !== commitment(plan) || template.planHash !== stored.planHash ||
    stored.authorizationTemplateHash !== commitment(template) ||
    stored.transactionHash !== settlement.transaction) {
    throw new CommerceSettlementErrorV1("PLACEMENT_MISMATCH", "Settlement does not match submitted placement");
  }
  const verification = await dependencies.verify({
    plan, template, signature: raw.signature, settlement,
  });
  if (!verification.accepted || verification.errorCodes.length > 0 || !verification.evidence) {
    if (verification.errorCodes.length === 1 &&
      verification.errorCodes[0] === "PAYMENT_SETTLEMENT_UNCONFIRMED") {
      throw new CommerceSettlementErrorV1(
        "SETTLEMENT_PENDING", "The x402 payment is awaiting confirmations", verification.errorCodes,
      );
    }
    const rejectionCode = verification.errorCodes[0] ?? "PAYMENT_SETTLEMENT_INVALID";
    await dependencies.placements.append({
      placementId, owner: stored.owner, expectedState: "submitted", state: "rejected",
      rejectionCode, observedAtSec: eventTime,
    });
    throw new CommerceSettlementErrorV1(
      "SETTLEMENT_REJECTED", "The x402 payment failed independent verification", verification.errorCodes,
    );
  }
  const evidenceHash = commitment(verification.evidence) as Hash;
  const placement = await dependencies.placements.append({
    placementId, owner: stored.owner, expectedState: "submitted", state: "confirmed",
    authorizationHash: stored.authorizationHash, transactionHash: stored.transactionHash,
    evidenceHash, observedAtSec: eventTime,
  });
  return {
    placement, state: "confirmed" as const, outcome: "payment-settled" as const,
    transactionHash: stored.transactionHash, evidence: verification.evidence, evidenceHash,
  };
}
