import { keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  commitment,
  type DecisionBundle,
  type MarketSnapshot,
  type StablecoinPolicy,
} from "../src/index";

export const account = privateKeyToAccount(
  keccak256(toHex("cobia-domain-test-signer")),
);
export const requestId = "550e8400-e29b-41d4-a716-446655440000";
export const asset = "0x2222222222222222222222222222222222222222";
export const hash = `0x${"ab".repeat(32)}` as const;
export const nowSec = Date.parse("2026-08-09T10:01:00.000Z") / 1_000;

export const criticalRiskFlag = {
  candidateId: "aave-v3:usdc",
  severity: "critical",
  code: "RESERVE_PAUSED",
  summary: "The reserve is paused.",
  evidenceHashes: [hash],
} satisfies DecisionBundle["riskFlags"][number];

export const policy: StablecoinPolicy = {
  version: 1,
  requestId,
  owner: "0x1111111111111111111111111111111111111111",
  executionChainId: 196,
  asset,
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
  requestId,
  chainId: 196,
  blockNumber: "19842331",
  blockHash: hash,
  capturedAt: "2026-08-09T10:00:00.000Z",
  asset: { address: asset, symbol: "USDC", decimals: 6 },
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

export async function signedBundle(
  overrides: Partial<Omit<DecisionBundle, "signature">> = {},
): Promise<DecisionBundle> {
  const unsigned = {
    version: 1,
    requestId,
    solverId: "determinist-labs",
    solverAddress: account.address,
    policyHash: commitment(policy),
    snapshotHash: commitment(snapshot),
    allocations: [
      { candidateId: "cash:usdc", bps: 6_000 },
      { candidateId: "aave-v3:usdc", bps: 4_000 },
    ],
    evidence: [
      {
        url: "https://aave.com/docs",
        title: "Aave documentation",
        retrievedAt: "2026-08-09T10:00:00.000Z",
        claim: "The reserve is active.",
        contentHash: hash,
      },
    ],
    riskFlags: [],
    expectedNetApyBps: 256,
    action: {
      kind: "aave-v3-supply",
      candidateId: "aave-v3:usdc",
      investmentId: "196-aave-usdc",
      amountAtomic: "10000000000",
    },
    validUntil: 2_000_000_000,
    ...overrides,
  } as Omit<DecisionBundle, "signature">;
  const signature = await account.signMessage({
    message: { raw: commitment(unsigned) },
  });
  return { ...unsigned, signature };
}
