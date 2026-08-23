import type {
  AssetIdentityEvidenceV1,
  AssetValuationEvidenceV1,
} from "@cobia/domain";
import { verifyPlainErc20BehaviorV1, type PlainErc20ForkV1 } from "./behavior";
import {
  verifyAssetIdentityV1,
  type AssetIdentityAnchorV1,
  type ClaimedAssetIdentityV1,
  type GeneralAsset,
  type PinnedAssetReaderV1,
} from "./identity";
import {
  verifyExecutableValuationV1,
  type AssetValuationInputV1,
} from "./valuation";

export interface VerifyAssetEvidenceInput {
  asset: GeneralAsset;
  anchor: AssetIdentityAnchorV1;
  claimedIdentity: ClaimedAssetIdentityV1;
  reader: PinnedAssetReaderV1;
  fork: PlainErc20ForkV1;
  valuation: AssetValuationInputV1;
  nowSec: number;
}

export type AssetEvidenceVerdictV1 = {
  accepted: false;
  errorCodes: string[];
} | {
  accepted: true;
  errorCodes: [];
  identityEvidence: AssetIdentityEvidenceV1;
  valuationEvidence: AssetValuationEvidenceV1;
};

export async function verifyAssetEvidenceV1(
  input: VerifyAssetEvidenceInput,
): Promise<AssetEvidenceVerdictV1> {
  const [identity, behaviorErrors] = await Promise.all([
    verifyAssetIdentityV1(input),
    verifyPlainErc20BehaviorV1(input.fork, input.asset, input.anchor),
  ]);
  const valuation = verifyExecutableValuationV1(
    input.asset,
    input.valuation,
    input.anchor.capturedAtSec,
    input.anchor.expiresAtSec,
    input.nowSec,
  );
  const errorCodes = [...new Set([
    ...identity.errorCodes,
    ...behaviorErrors,
    ...valuation.errorCodes,
  ])].sort();
  if (errorCodes.length > 0 || !identity.evidence || !valuation.evidence) {
    return { accepted: false, errorCodes };
  }
  return {
    accepted: true,
    errorCodes: [],
    identityEvidence: identity.evidence,
    valuationEvidence: valuation.evidence,
  };
}
