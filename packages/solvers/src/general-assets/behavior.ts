import type { GeneralAsset, AssetIdentityAnchorV1 } from "./identity";

export type Erc20ReturnObservation = "true" | "false" | "none";

export interface PlainErc20ProbeV1 {
  transferReturn: Erc20ReturnObservation;
  transferFromReturn: Erc20ReturnObservation;
  approveReturn: Erc20ReturnObservation;
  transferAtomic: string;
  senderDecreaseAtomic: string;
  recipientIncreaseAtomic: string;
  allowanceDecreaseAtomic: string;
  approvalCleanupSucceeded: boolean;
  replayDeterministic: boolean;
  balancesStableWithoutTransfers: boolean;
  callbackCount: number;
  blacklistOrPauseSurface: boolean;
  adminBalanceControlSurface: boolean;
}

export interface PlainErc20ForkV1 {
  probePlainErc20(asset: GeneralAsset, anchor: AssetIdentityAnchorV1): Promise<PlainErc20ProbeV1>;
}

export async function verifyPlainErc20BehaviorV1(
  fork: PlainErc20ForkV1,
  asset: GeneralAsset,
  anchor: AssetIdentityAnchorV1,
): Promise<string[]> {
  const probe = await fork.probePlainErc20(asset, anchor);
  const errors = new Set<string>();
  if ([probe.transferReturn, probe.transferFromReturn, probe.approveReturn].some((value) => value !== "true")) {
    errors.add("ASSET_TRANSFER_RETURN_UNSUPPORTED");
  }
  if (probe.senderDecreaseAtomic !== probe.transferAtomic ||
      probe.recipientIncreaseAtomic !== probe.transferAtomic ||
      probe.allowanceDecreaseAtomic !== probe.transferAtomic) {
    errors.add("ASSET_TRANSFER_FEE_UNSUPPORTED");
  }
  if (!probe.approvalCleanupSucceeded) errors.add("ASSET_APPROVAL_CLEANUP_FAILED");
  if (!probe.replayDeterministic || !probe.balancesStableWithoutTransfers) {
    errors.add("ASSET_REBASING_UNSUPPORTED");
  }
  if (!Number.isSafeInteger(probe.callbackCount) || probe.callbackCount !== 0) {
    errors.add("ASSET_CALLBACK_UNSUPPORTED");
  }
  if (probe.blacklistOrPauseSurface) errors.add("ASSET_BLACKLIST_CONTROL_UNSUPPORTED");
  if (probe.adminBalanceControlSurface) errors.add("ASSET_ADMIN_BALANCE_CONTROL_UNSUPPORTED");
  return [...errors].sort();
}
