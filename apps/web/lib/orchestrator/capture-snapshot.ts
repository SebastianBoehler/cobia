import {
  MarketSnapshotSchema,
  type MarketSnapshot,
  type StablecoinPolicy,
} from "@cobia/domain";
import { isAddressEqual } from "viem";
import {
  AAVE_V3_POOL,
  type SnapshotBlockReader,
} from "../chain/xlayer";
import type { OkxClient } from "../okx/client";
import { normalizeAaveProduct } from "../okx/normalize";

interface SnapshotDependencies {
  okx: Pick<OkxClient, "searchProducts" | "getProductDetail">;
  blocks: SnapshotBlockReader;
  now?: () => Date;
}

function freezeSnapshot(snapshot: MarketSnapshot): MarketSnapshot {
  Object.freeze(snapshot.asset);
  for (const candidate of snapshot.candidates) Object.freeze(candidate);
  Object.freeze(snapshot.candidates);
  return Object.freeze(snapshot);
}

export async function captureSnapshot(
  policy: StablecoinPolicy,
  dependencies: SnapshotDependencies,
): Promise<MarketSnapshot> {
  const startedAt = await dependencies.blocks.getLatestBlock();
  const capturedAt = (dependencies.now ?? (() => new Date()))().toISOString();
  const products = await dependencies.okx.searchProducts({
    tokenKeywordList: ["USDG"],
    platformKeywordList: ["AAVE V3"],
    chainIndex: "196",
    productGroup: "LENDING",
    pageNum: 1,
  });
  const investmentIds = [
    ...new Set(
      products
        .filter(
          (product) =>
            product.chainIndex === "196" &&
            product.platformName === "Aave V3" &&
            product.name === "USDG",
        )
        .map((product) => product.investmentId),
    ),
  ].sort();
  if (investmentIds.length === 0) {
    throw new Error("OKX returned no Aave V3 USDG product on X Layer");
  }

  const normalized = await Promise.all(
    investmentIds.map(async (investmentId) =>
      normalizeAaveProduct(await dependencies.okx.getProductDetail(investmentId), {
        expectedSymbol: "USDG",
        poolAddress: AAVE_V3_POOL,
        retrievedAt: capturedAt,
      }),
    ),
  );
  for (const product of normalized) {
    if (!isAddressEqual(product.asset.address, policy.asset)) {
      throw new Error("OKX product asset does not match policy asset");
    }
  }

  const finishedAt = await dependencies.blocks.getLatestBlock();
  if (
    finishedAt.number < startedAt.number ||
    finishedAt.number - startedAt.number > 5n
  ) {
    throw new Error("Snapshot data was collected across more than five blocks");
  }

  const asset = normalized[0].asset;
  const snapshot = MarketSnapshotSchema.parse({
    version: 1,
    requestId: policy.requestId,
    chainId: 196,
    blockNumber: startedAt.number.toString(),
    blockHash: startedAt.hash,
    capturedAt,
    asset,
    candidates: [
      {
        id: `cash:${asset.symbol.toLowerCase()}`,
        kind: "cash",
        apyBps: 0,
        tvlUsdE6: "0",
        retrievedAt: capturedAt,
      },
      ...normalized.map((product) => product.candidate),
    ],
  });
  return freezeSnapshot(snapshot);
}
