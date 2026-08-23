import { commitment, type GeneralAssetPolicyV1 } from "@cobia/domain";
import { GeneralAssetEvidenceArtifactV1Schema, type GeneralAssetEvidenceArtifactV1,
  type RegisteredAdapterManifestV1 } from "@cobia/solvers";
import type { Address } from "viem";
import { GeneralAssetRefreshRequiredError } from "./general-asset-compilation-receipt";

interface Dependencies {
  activeManifest: RegisteredAdapterManifestV1;
  missingOwnerBalanceChains(input: { owner: Address; executionChainIds: readonly number[] }): Promise<number[]>;
  persist(input: { policy: GeneralAssetPolicyV1; ownerSignature: `0x${string}`;
    generalAssetEvidence: GeneralAssetEvidenceArtifactV1 }): Promise<unknown>;
  nowSec(): number;
}

export class GeneralAssetManifestMismatchError extends Error {}
export class GeneralAssetOwnerBalanceRequiredError extends Error {}

export async function publishGeneralAssetIntentV1(input: {
  policy: GeneralAssetPolicyV1;
  ownerSignature: `0x${string}`;
  generalAssetEvidence: unknown;
}, deps: Dependencies) {
  if (input.policy.manifestHash !== commitment(deps.activeManifest)) {
    throw new GeneralAssetManifestMismatchError("General asset policy targets an inactive manifest");
  }
  const executionChainIds = [...new Set([
    input.policy.sourceChainId, input.policy.destinationChainId,
  ])].sort((left, right) => left - right);
  if ((await deps.missingOwnerBalanceChains({ owner: input.policy.owner as Address,
    executionChainIds })).length) throw new GeneralAssetOwnerBalanceRequiredError();
  const evidence = GeneralAssetEvidenceArtifactV1Schema.parse(input.generalAssetEvidence);
  if (commitment(evidence.manifest) !== input.policy.manifestHash) {
    throw new Error("General asset manifest evidence changed");
  }
  const inputIdentity = evidence.identities.find((value) =>
    commitment(value) === input.policy.inputIdentityHash && value.chainId === input.policy.input.chainId &&
    value.token === input.policy.input.token);
  const inputValuation = evidence.valuations.find((value) =>
    commitment(value) === input.policy.inputValuationHash &&
    value.assetIdentityHash === input.policy.inputIdentityHash &&
    value.inputAtomic === input.policy.input.maximumAtomic);
  if (!inputIdentity || !inputValuation ||
      BigInt(inputValuation.conservativeValueUsdE8) > BigInt(input.policy.input.maximumUsdE8)) {
    throw new Error("General asset input evidence is unavailable or changed");
  }
  for (const output of input.policy.outputs) {
    if (!evidence.identities.some((value) => commitment(value) === output.identityHash &&
      value.chainId === output.chainId && value.token === output.token)) {
      throw new Error("General asset output evidence is unavailable or changed");
    }
  }
  const evidenceExpiry = Math.min(...evidence.identities.map(({ expiresAtSec }) => expiresAtSec),
    ...evidence.valuations.map(({ expiresAtSec }) => expiresAtSec));
  if (deps.nowSec() >= evidenceExpiry || input.policy.competition.closesAt > evidenceExpiry) {
    throw new GeneralAssetRefreshRequiredError(
      "General asset compilation evidence expired; refresh before signing",
    );
  }
  return deps.persist({ policy: input.policy, ownerSignature: input.ownerSignature,
    generalAssetEvidence: evidence });
}
