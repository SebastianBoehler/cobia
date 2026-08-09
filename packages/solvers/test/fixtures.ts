import {
  commitment,
  type MarketSnapshot,
  type StablecoinPolicy,
} from "@cobia/domain";
import { privateKeyToAccount } from "viem/accounts";

export const solverAccount = privateKeyToAccount(
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);

export const policy: StablecoinPolicy = {
  version: 1,
  requestId: "550e8400-e29b-41d4-a716-446655440000",
  owner: "0x1111111111111111111111111111111111111111",
  executionChainId: 196,
  asset: "0x2222222222222222222222222222222222222222",
  principalAtomic: "25000000000",
  maxProtocolExposureBps: 4_000,
  minTvlUsdE6: "250000000000",
  minNetApyBps: 200,
  maxSnapshotAgeSec: 300,
  deadline: 2_000_000_000,
  noBridges: true,
};

export const snapshot: MarketSnapshot = {
  version: 1,
  requestId: policy.requestId,
  chainId: 196,
  blockNumber: "19842331",
  blockHash: `0x${"ab".repeat(32)}`,
  capturedAt: "2026-08-09T10:00:00.000Z",
  asset: { address: policy.asset, symbol: "USDC", decimals: 6 },
  candidates: [
    {
      id: "cash:usdc",
      kind: "cash",
      apyBps: 0,
      tvlUsdE6: "0",
      retrievedAt: "2026-08-09T10:00:00.000Z",
    },
    {
      id: "aave-v3:usdc",
      kind: "aave-v3",
      investmentId: "196-aave-usdc",
      poolAddress: "0x3333333333333333333333333333333333333333",
      apyBps: 642,
      tvlUsdE6: "500000000000",
      utilizationBps: 7_200,
      retrievedAt: "2026-08-09T10:00:00.000Z",
    },
  ],
};

export const nowSec = Date.parse("2026-08-09T10:01:00.000Z") / 1_000;
export const policyHash = commitment(policy);
export const snapshotHash = commitment(snapshot);
