import type { GeneralIntentPolicyV2, StablecoinPolicy } from "@cobia/domain";

type MarketPolicy = Pick<StablecoinPolicy, "executionChainId" | "asset"> | {
  executionChainId: GeneralIntentPolicyV2["executionChainId"];
  kind: GeneralIntentPolicyV2["kind"];
  input: Pick<GeneralIntentPolicyV2["input"], "token">;
};

export function marketAsset(policy: MarketPolicy): string {
  return ("asset" in policy ? policy.asset : policy.input.token).toLowerCase();
}

export function marketIdentity(policy: MarketPolicy): string {
  return `${policy.executionChainId}:${marketAsset(policy)}`;
}

export function verifyStoredMarketIdentity(
  stored: { id: string; executionChainId: number; asset: string },
  policy: MarketPolicy,
): void {
  if (
    stored.id !== marketIdentity(policy)
    || stored.executionChainId !== policy.executionChainId
    || stored.asset !== marketAsset(policy)
  ) {
    throw new Error("Stored market identity conflicts with the signed policy");
  }
}
