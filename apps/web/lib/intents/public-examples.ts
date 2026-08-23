import type { GeneralAssetLaunchState } from "../network/general-asset-launch-status";

const STABLE_SWAP = "Swap 10 @USDG into at least 9.95 @USDt0 on @XLayer";
const MULTI_STEP = "Turn 0.1 @USDG into @OKB using at least 2 wallet steps on @XLayer";

export const V3_INTENT_EXAMPLES = [
  STABLE_SWAP,
  "Supply 10 @USDG to @Aave on @XLayer",
  MULTI_STEP,
] as const;

export const V4_INTENT_EXAMPLES = [
  STABLE_SWAP,
  "Acquire at least 0.01 @TSLAx with at most 10 @USDG on @XLayer for an eligible DE holder",
  MULTI_STEP,
] as const;

export function publicIntentExamples(state?: GeneralAssetLaunchState): readonly string[] {
  return state === "live" ? V4_INTENT_EXAMPLES : V3_INTENT_EXAMPLES;
}
