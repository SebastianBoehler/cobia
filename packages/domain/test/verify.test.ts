import { keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  commitment,
  projectRouteQuote,
  verifyBundle,
  type DecisionBundle,
  type MarketSnapshot,
  type StablecoinPolicy,
} from "../src/index";

const account = privateKeyToAccount(keccak256(toHex("cobia-domain-test-signer")));
const requestId = "550e8400-e29b-41d4-a716-446655440000";
const asset = "0x2222222222222222222222222222222222222222";
const hash = `0x${"ab".repeat(32)}` as const;
const nowSec = Date.parse("2026-08-09T10:01:00.000Z") / 1_000;

const policy: StablecoinPolicy = {
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

const snapshot: MarketSnapshot = {
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

async function signedBundle(
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

describe("deterministic bundle verification", () => {
  it("recomputes a valid bundle instead of trusting solver calculations", async () => {
    const verdict = await verifyBundle(
      policy,
      snapshot,
      await signedBundle(),
      account.address,
      nowSec,
    );

    expect(verdict).toMatchObject({
      executable: true,
      errorCodes: [],
      recomputedNetApyBps: 256,
      riskPenaltyBps: 0,
      score: 256,
    });
  });

  it("rejects a bundle for a different policy", async () => {
    const verdict = await verifyBundle(
      policy,
      snapshot,
      await signedBundle({ policyHash: hash }),
      account.address,
      nowSec,
    );
    expect(verdict.errorCodes).toContain("POLICY_HASH_MISMATCH");
  });

  it("rejects a stale market snapshot", async () => {
    const verdict = await verifyBundle(
      policy,
      snapshot,
      await signedBundle(),
      account.address,
      nowSec + 301,
    );
    expect(verdict.errorCodes).toContain("SNAPSHOT_STALE");
  });

  it("rejects allocation beyond the policy exposure cap", async () => {
    const allocations = [
      { candidateId: "cash:usdc", bps: 5_000 },
      { candidateId: "aave-v3:usdc", bps: 5_000 },
    ];
    const verdict = await verifyBundle(
      policy,
      snapshot,
      await signedBundle({ allocations }),
      account.address,
      nowSec,
    );
    expect(verdict.errorCodes).toContain("EXPOSURE_LIMIT_EXCEEDED");
  });

  it("rejects an action amount that differs from its verified allocation", async () => {
    const verdict = await verifyBundle(
      policy,
      snapshot,
      await signedBundle({
        action: {
          kind: "aave-v3-supply",
          candidateId: "aave-v3:usdc",
          investmentId: "196-aave-usdc",
          amountAtomic: "9999999999",
        },
      }),
      account.address,
      nowSec,
    );
    expect(verdict.errorCodes).toContain("ACTION_AMOUNT_MISMATCH");
  });

  it("rejects an unknown route candidate", async () => {
    const verdict = await verifyBundle(
      policy,
      snapshot,
      await signedBundle({
        allocations: [
          { candidateId: "cash:usdc", bps: 6_000 },
          { candidateId: "bridge:unknown", bps: 4_000 },
        ],
      }),
      account.address,
      nowSec,
    );
    expect(verdict.errorCodes).toContain("UNKNOWN_CANDIDATE");
  });

  it("rejects critical sourced risk", async () => {
    const verdict = await verifyBundle(
      policy,
      snapshot,
      await signedBundle({
        riskFlags: [
          {
            candidateId: "aave-v3:usdc",
            severity: "critical",
            code: "RESERVE_PAUSED",
            summary: "The reserve is paused.",
            evidenceHashes: [hash],
          },
        ],
      }),
      account.address,
      nowSec,
    );
    expect(verdict.errorCodes).toContain("CRITICAL_RISK");
  });

  it("rejects a bundle signed by a different solver", async () => {
    const verdict = await verifyBundle(
      policy,
      snapshot,
      await signedBundle(),
      "0x4444444444444444444444444444444444444444",
      nowSec,
    );
    expect(verdict.errorCodes).toContain("SOLVER_SIGNATURE_INVALID");
  });
});

describe("public quote projection", () => {
  it("exposes comparison metrics without leaking executable route fields", async () => {
    const bundle = await signedBundle();
    const verdict = await verifyBundle(
      policy,
      snapshot,
      bundle,
      account.address,
      nowSec,
    );
    const quote = projectRouteQuote(bundle, verdict, "100000", 2_000_000_000);
    const serialized = JSON.stringify(quote);

    expect(quote).toMatchObject({
      solverId: "determinist-labs",
      expectedNetApyBps: 256,
      priceAtomic: "100000",
    });
    expect(serialized).not.toContain("aave-v3-supply");
    expect(serialized).not.toContain("196-aave-usdc");
    expect(serialized).not.toContain("https://");
    expect(serialized).not.toContain("10000000000");
  });
});
