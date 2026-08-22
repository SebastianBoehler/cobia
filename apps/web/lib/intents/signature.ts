import {
  commitment,
  type CapabilityCompositionPolicyV1,
  type OpenIntentPolicyV3,
  type PersistedIntentPolicy,
} from "@cobia/domain";
import { isAddressEqual, recoverMessageAddress, type Hex } from "viem";
import { quoteSelectionCommitment, routeAccessCommitment } from "./commitments";

export { quoteSelectionCommitment, routeAccessCommitment } from "./commitments";

export async function verifyPolicyOwnerSignature(
  policy: PersistedIntentPolicy | OpenIntentPolicyV3 | CapabilityCompositionPolicyV1,
  signature: Hex,
): Promise<void> {
  const signer = await recoverMessageAddress({
    message: { raw: commitment(policy) },
    signature,
  });
  if (!isAddressEqual(signer, policy.owner)) {
    throw new Error("Intent signature does not match owner");
  }
}

export async function verifyQuoteSelectionSignature(
  owner: `0x${string}`,
  requestId: string,
  quoteId: string,
  signature: Hex,
): Promise<void> {
  const signer = await recoverMessageAddress({
    message: { raw: quoteSelectionCommitment(requestId, quoteId) },
    signature,
  });
  if (!isAddressEqual(signer, owner)) {
    throw new Error("Quote selection signature does not match owner");
  }
}

export async function verifyRouteAccessSignature(
  buyer: `0x${string}`,
  routeId: string,
  timestamp: number,
  signature: Hex,
): Promise<void> {
  const signer = await recoverMessageAddress({
    message: { raw: routeAccessCommitment(routeId, buyer, timestamp) },
    signature,
  });
  if (!isAddressEqual(signer, buyer)) {
    throw new Error("Quote access signature does not match buyer");
  }
}
