import { isAddress, type Address } from "viem";

export const V4_COMBINED_MIGRATION_BUDGET_USD_E8 = 5_000_000_000_000n;
const ONE_USD_E8 = 100_000_000n;
const ATOMIC = /^(0|[1-9][0-9]*)$/;

export interface V3MigrationAssetV4 {
  chainId: 1 | 196;
  token: Address;
  decimals: number;
  fixedUsdE8PerToken: string;
  maximumRemainingAtomic: string;
}

export interface PartitionedMigrationBudgetInputV4 {
  chainId: 1 | 196;
  combinedProtocolBudgetUsdE8: string;
  v4ProtocolCapUsdE8: string;
  v3Assets: readonly V3MigrationAssetV4[];
}

function positive(value: string, label: string): bigint {
  if (!ATOMIC.test(value) || value === "0") throw new Error(`${label} is invalid`);
  return BigInt(value);
}

export function assertPartitionedMigrationBudgetV4(input: PartitionedMigrationBudgetInputV4) {
  const combined = positive(input.combinedProtocolBudgetUsdE8, "Combined migration budget");
  if (combined !== V4_COMBINED_MIGRATION_BUDGET_USD_E8) {
    throw new Error("Combined migration budget must remain fixed at 50000 USD");
  }
  const v4 = positive(input.v4ProtocolCapUsdE8, "V4 protocol cap");
  const identities = new Set<string>();
  let v3 = 0n;
  for (const asset of input.v3Assets) {
    if (asset.chainId !== input.chainId || !isAddress(asset.token) ||
        asset.token !== asset.token.toLowerCase()) {
      throw new Error("V3 migration asset chain or token is invalid");
    }
    if (!Number.isInteger(asset.decimals) || asset.decimals < 0 || asset.decimals > 36) {
      throw new Error("V3 migration asset decimals are invalid");
    }
    if (asset.fixedUsdE8PerToken !== ONE_USD_E8.toString()) {
      throw new Error("V3 migration asset is not explicitly fixed at one USD");
    }
    if (!ATOMIC.test(asset.maximumRemainingAtomic)) {
      throw new Error("V3 maximum remaining atomic amount is invalid");
    }
    const key = `${asset.chainId}:${asset.token}`;
    if (identities.has(key)) throw new Error("V3 migration assets must be unique");
    identities.add(key);
    const scale = 10n ** BigInt(asset.decimals);
    const numerator = BigInt(asset.maximumRemainingAtomic) * ONE_USD_E8;
    v3 += (numerator + scale - 1n) / scale;
  }
  if (v3 + v4 > combined) throw new Error("Combined V3 and V4 migration exposure exceeds 50000 USD");
  return { combinedProtocolBudgetUsdE8: combined.toString(), v3RemainingUsdE8: v3.toString(),
    v4ProtocolCapUsdE8: v4.toString(), unusedUsdE8: (combined - v3 - v4).toString() };
}
