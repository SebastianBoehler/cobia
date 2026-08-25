import { readGeneralAssetRpcConfig, readOkxCredentials } from "../env";
import { createOkxClient } from "../okx/client";
import { replayAssetEvidenceRemotely } from "../replay/remote-client";
import { createGeneralAssetIdentityCaptureV1 } from "./general-asset-chain-reader";
import { createOkxGeneralAssetEligibilityV2,
  type OkxGeneralAssetEligibilityOptions } from "./okx-general-asset-eligibility";

export function createProductionGeneralAssetEligibilityV2(
  options: OkxGeneralAssetEligibilityOptions = {},
) {
  const okx = createOkxClient({ credentials: readOkxCredentials() });
  return createOkxGeneralAssetEligibilityV2({
    nowSec: () => Math.floor(Date.now() / 1_000),
    market: okx,
    captureIdentity: createGeneralAssetIdentityCaptureV1(readGeneralAssetRpcConfig()),
    replayProbe: replayAssetEvidenceRemotely,
  }, options);
}
