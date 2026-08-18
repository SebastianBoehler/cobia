import type { GeneralIntentPolicyV1, StablecoinPolicy } from "@cobia/domain";

type MarketPolicy = Pick<StablecoinPolicy, "executionChainId" | "asset"> | {
  executionChainId: GeneralIntentPolicyV1["executionChainId"];
  kind: GeneralIntentPolicyV1["kind"];
  input: Pick<GeneralIntentPolicyV1["input"], "token">;
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
