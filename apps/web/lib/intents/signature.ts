import { commitment, type StablecoinPolicy } from "@cobia/domain";
import { isAddressEqual, recoverMessageAddress, type Hex } from "viem";
import { quoteSelectionCommitment } from "./commitments";

export { quoteSelectionCommitment } from "./commitments";

export async function verifyPolicyOwnerSignature(
  policy: StablecoinPolicy,
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
