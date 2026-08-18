import { commitment } from "@cobia/domain";
import { isAddress, isAddressEqual, type Address, type Hash, type Hex } from "viem";
import { z } from "zod";
import {
  finalizeX402PaymentV2,
  X402AuthorizationTemplateV1Schema,
} from "./x402-authorization";

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
  authorizationHash: HashSchema.nullish(),
  updatedAt: z.date().optional(),
}).passthrough();

export type CommerceAuthorizationErrorCodeV1 =
  | "PLACEMENT_NOT_FOUND" | "PLACEMENT_MISMATCH"
  | "AUTHORIZATION_EXPIRED" | "SETTLEMENT_ALREADY_ATTEMPTED" | "SETTLEMENT_UNCERTAIN";

export class CommerceAuthorizationErrorV1 extends Error {
  constructor(readonly code: CommerceAuthorizationErrorCodeV1, message: string) {
    super(message);
  }
}

export async function authorizeCommercePlacementV1(
  raw: { placementId: unknown; template: unknown; signature: unknown },
  dependencies: {
    nowSec: number;
    placements: {
      read(id: string): Promise<unknown>;
      append(event: Record<string, unknown>): Promise<unknown>;
    };
    execute(input: { expected: unknown; submitted: unknown; signature: unknown }): Promise<{
      settlement: { transaction: Hash };
      authorizationHash: Hash;
      resourceHash: Hash;
      resourceBody: Uint8Array;
    }>;
  },
) {
  const placementId = z.string().uuid().parse(raw.placementId);
  const template = X402AuthorizationTemplateV1Schema.parse(raw.template);
  const storedValue = await dependencies.placements.read(placementId);
  if (!storedValue) {
    throw new CommerceAuthorizationErrorV1("PLACEMENT_NOT_FOUND", "Commerce placement was not found");
  }
  const stored = PlacementSchema.parse(storedValue);
  const templateHash = commitment(template) as Hash;
  if (stored.id !== placementId || !isAddressEqual(stored.owner, template.authorization.from) ||
    stored.offerCommitment !== template.offerCommitment || stored.policyHash !== template.policyHash ||
    stored.programHash !== template.programHash || stored.planHash !== template.planHash ||
    stored.authorizationTemplateHash !== templateHash) {
    throw new CommerceAuthorizationErrorV1("PLACEMENT_MISMATCH", "Authorization does not match prepared placement");
  }
  if (stored.state !== "prepared") {
    throw new CommerceAuthorizationErrorV1(
      "SETTLEMENT_ALREADY_ATTEMPTED", "This commerce authorization has already been attempted",
    );
  }
  const validAfter = Number(template.authorization.validAfter);
  const validBefore = Number(template.authorization.validBefore);
  if (dependencies.nowSec < validAfter || dependencies.nowSec >= validBefore) {
    throw new CommerceAuthorizationErrorV1(
      "AUTHORIZATION_EXPIRED", "The exact commerce authorization window is no longer valid",
    );
  }
  let signature: Hex;
  try {
    const finalized = await finalizeX402PaymentV2({
      expected: template, submitted: template, signature: raw.signature,
    });
    signature = finalized.paymentPayload.payload.signature;
  } catch {
    throw new CommerceAuthorizationErrorV1("PLACEMENT_MISMATCH", "Owner authorization is invalid");
  }
  const authorizationHash = commitment({ templateHash, signature }) as Hash;
  const eventTime = Math.max(
    dependencies.nowSec,
    stored.updatedAt ? Math.floor(stored.updatedAt.getTime() / 1_000) + 1 : dependencies.nowSec,
  );
  await dependencies.placements.append({
    placementId, owner: stored.owner, expectedState: "prepared", state: "authorizing",
    authorizationHash, observedAtSec: eventTime,
  });
  try {
    const result = await dependencies.execute({ expected: template, submitted: template, signature });
    if (result.authorizationHash !== authorizationHash) throw new Error("Authorization hash changed");
    const placement = await dependencies.placements.append({
      placementId, owner: stored.owner, expectedState: "authorizing", state: "submitted",
      authorizationHash, transactionHash: result.settlement.transaction,
      observedAtSec: eventTime + 1,
    });
    return {
      placement, state: "submitted" as const,
      transactionHash: result.settlement.transaction,
      authorizationHash, settlement: result.settlement, resourceHash: result.resourceHash,
      resourceBodyBase64: Buffer.from(result.resourceBody).toString("base64"),
    };
  } catch {
    throw new CommerceAuthorizationErrorV1(
      "SETTLEMENT_UNCERTAIN",
      "The paid request may have settled; inspect the authorization nonce before any further action",
    );
  }
}
