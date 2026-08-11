import { describe, expect, it } from "vitest";
import {
  DecisionBundleSchema,
  MarketSnapshotSchema,
  RouteQuoteSchema,
  StablecoinPolicySchema,
  canonicalJson,
  commitment,
  parseStablecoinPolicy,
} from "../src/index";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const owner = "0x1111111111111111111111111111111111111111";
const asset = "0x2222222222222222222222222222222222222222";
const pool = "0x3333333333333333333333333333333333333333";
const hash = `0x${"ab".repeat(32)}`;
const signature = `0x${"cd".repeat(65)}`;

const policy = {
  version: 1,
  requestId,
  owner,
  executionChainId: 196,
  asset,
  principalAtomic: "25000000000",
  maxProtocolExposureBps: 4_000,
  minTvlUsdE6: "250000000000",
  minNetApyBps: 300,
  maxSnapshotAgeSec: 300,
  deadline: 2_000_000_000,
  noBridges: true,
} as const;

const snapshot = {
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
      poolAddress: pool,
      apyBps: 642,
      tvlUsdE6: "500000000000",
      utilizationBps: 7_200,
      retrievedAt: "2026-08-09T10:00:00.000Z",
    },
  ],
} as const;

const bundle = {
  version: 1,
  requestId,
  solverId: "determinist-labs",
  solverAddress: owner,
  policyHash: hash,
  snapshotHash: hash,
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
  signature,
} as const;

describe("canonical commitments", () => {
  it("keeps object order from changing a commitment", () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(commitment({ b: 2, a: 1 })).toBe(
      "0xb8ffb64722137f4b100665a52e3c943f8066e8ab8ba3b427e6f4b404defd82b0",
    );
  });

  it("keeps array order significant", () => {
    expect(commitment(["a", "b"])).not.toBe(commitment(["b", "a"]));
  });

  it("rejects unsafe numeric input instead of rounding it", () => {
    expect(() => canonicalJson({ amount: 1.5 })).toThrow("safe integers");
  });
});

describe("domain boundaries", () => {
  it("accepts the supported stablecoin policy", () => {
    expect(StablecoinPolicySchema.parse(policy)).toEqual(policy);
  });

  it("rejects fractional atomic amounts", () => {
    expect(
      StablecoinPolicySchema.safeParse({ ...policy, principalAtomic: "1.5" })
        .success,
    ).toBe(false);
  });

  it("rejects execution on a chain other than X Layer", () => {
    expect(
      StablecoinPolicySchema.safeParse({ ...policy, executionChainId: 1 })
        .success,
    ).toBe(false);
  });

  it("rejects snapshot freshness windows beyond the settlement window", () => {
    expect(StablecoinPolicySchema.safeParse({ ...policy, maxSnapshotAgeSec: 301 }).success)
      .toBe(false);
  });

  it("rejects an expired policy at the request boundary", () => {
    expect(() => parseStablecoinPolicy(policy, 2_000_000_001)).toThrow(
      "deadline",
    );
  });

  it("accepts a structurally valid immutable snapshot", () => {
    expect(
      MarketSnapshotSchema.safeParse({ ...snapshot, requestId: crypto.randomUUID() }).success,
    ).toBe(true);
  });

  it("rejects a snapshot from another chain", () => {
    expect(
      MarketSnapshotSchema.safeParse({ ...snapshot, chainId: 1 }).success,
    ).toBe(false);
  });

  it("rejects a bundle whose allocations do not total 10000 bps", () => {
    expect(
      DecisionBundleSchema.safeParse({
        ...bundle,
        allocations: [{ candidateId: "cash:usdc", bps: 9_999 }],
      }).success,
    ).toBe(false);
  });

  it("rejects non-http evidence", () => {
    expect(
      DecisionBundleSchema.safeParse({
        ...bundle,
        evidence: [{ ...bundle.evidence[0], url: "ipfs://untrusted" }],
      }).success,
    ).toBe(false);
  });

  it("accepts the complete private bundle", () => {
    expect(DecisionBundleSchema.parse(bundle)).toEqual(bundle);
  });

  it("rejects private route fields from a public quote", () => {
    const quote = {
      version: 1,
      quoteId: hash,
      requestId,
      solverId: "determinist-labs",
      solverAddress: owner,
      bundleHash: hash,
      expectedNetApyBps: 256,
      riskGrade: "moderate",
      priceAtomic: "100000",
      validUntil: 2_000_000_000,
      verification: { executable: true, errorCodes: [], score: 231 },
      action: bundle.action,
    };

    expect(RouteQuoteSchema.safeParse(quote).success).toBe(false);
  });
});
