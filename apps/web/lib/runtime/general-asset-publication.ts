import type { GeneralAssetPolicyV1 } from "@cobia/domain";
import type { Address } from "viem";

interface Dependencies {
  activeManifestHash: string;
  missingOwnerBalanceChains(input: { owner: Address; executionChainIds: readonly number[] }): Promise<number[]>;
  verifier: { eligibility(input: { chainId: 1 | 196; token: Address; inputAtomic?: string }): Promise<
    { status: "verification_pending" | "unsupported"; reason: string } |
    { status: "eligible"; identityHash: `0x${string}`; valuationHash?: `0x${string}`;
      valuationEvidence?: { conservativeValueUsdE8: string } }
  > };
  persist(input: { policy: GeneralAssetPolicyV1; ownerSignature: `0x${string}` }): Promise<unknown>;
}

export class GeneralAssetManifestMismatchError extends Error {}
export class GeneralAssetOwnerBalanceRequiredError extends Error {}

export async function publishGeneralAssetIntentV1(input: {
  policy: GeneralAssetPolicyV1;
  ownerSignature: `0x${string}`;
}, deps: Dependencies) {
  if (input.policy.manifestHash !== deps.activeManifestHash) {
    throw new GeneralAssetManifestMismatchError("General asset policy targets an inactive manifest");
  }
  const executionChainIds = [...new Set([
    input.policy.sourceChainId, input.policy.destinationChainId,
  ])].sort((left, right) => left - right);
  if ((await deps.missingOwnerBalanceChains({ owner: input.policy.owner as Address,
    executionChainIds })).length) throw new GeneralAssetOwnerBalanceRequiredError();
  const inputEvidence = await deps.verifier.eligibility({ chainId: input.policy.input.chainId,
    token: input.policy.input.token as Address, inputAtomic: input.policy.input.maximumAtomic });
  if (inputEvidence.status !== "eligible" || inputEvidence.identityHash !== input.policy.inputIdentityHash ||
      inputEvidence.valuationHash !== input.policy.inputValuationHash ||
      !inputEvidence.valuationEvidence ||
      BigInt(inputEvidence.valuationEvidence.conservativeValueUsdE8) > BigInt(input.policy.input.maximumUsdE8)) {
    throw new Error("General asset input evidence is unavailable or changed");
  }
  for (const output of input.policy.outputs) {
    const evidence = await deps.verifier.eligibility({ chainId: output.chainId,
      token: output.token as Address });
    if (evidence.status !== "eligible" || evidence.identityHash !== output.identityHash) {
      throw new Error("General asset output evidence is unavailable or changed");
    }
  }
  return deps.persist(input);
}
