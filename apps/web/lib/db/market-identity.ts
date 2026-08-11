import type { StablecoinPolicy } from "@cobia/domain";

type MarketPolicy = Pick<StablecoinPolicy, "executionChainId" | "asset">;

export function marketIdentity(policy: MarketPolicy): string {
  return `${policy.executionChainId}:${policy.asset.toLowerCase()}`;
}

export function verifyStoredMarketIdentity(
  stored: { id: string; executionChainId: number; asset: string },
  policy: MarketPolicy,
): void {
  if (
    stored.id !== marketIdentity(policy)
    || stored.executionChainId !== policy.executionChainId
    || stored.asset !== policy.asset.toLowerCase()
  ) {
    throw new Error("Stored market identity conflicts with the signed policy");
  }
}
