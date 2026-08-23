import { commitment, type AssetIdentityEvidenceV1, type AssetValuationEvidenceV1 } from "@cobia/domain";
import { describe, expect, it, vi } from "vitest";
import { revalidateStageEvidenceV4 } from "./revalidate-stage-evidence";

const inputToken = "0x2222222222222222222222222222222222222222" as const;
const outputToken = "0x3333333333333333333333333333333333333333" as const;
const target = "0x4444444444444444444444444444444444444444" as const;
const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const nowSec = 2_000_000_000;

function identity(token: `0x${string}`, byte: string): AssetIdentityEvidenceV1 {
  return { version: 1, chainId: 196, token, runtimeCodeHash: hash(byte),
    proxy: { kind: "none" }, decimals: 18, behaviorModule: { id: "plain-erc20", version: 1 },
    blockNumber: "1000", blockHash: hash("a"), capturedAtSec: nowSec - 20, expiresAtSec: nowSec + 40 };
}

function fixture() {
  const inputIdentity = identity(inputToken, "1");
  const outputIdentity = identity(outputToken, "2");
  const valuation: AssetValuationEvidenceV1 = { version: 1,
    assetIdentityHash: commitment(inputIdentity), referenceAsset: { chainId: 196, token: outputToken },
    inputAtomic: "100", conservativeValueUsdE8: "200", maximumDisagreementBps: 500,
    quotes: [{ adapter: { id: "okx.swap", version: 1 }, outputAtomic: "90",
      referenceValueUsdE8: "200", liquidityUsdE8: "10000000000000", priceImpactBps: 10,
      fetchedAtSec: nowSec - 20, expiresAtSec: nowSec + 40, quoteHash: hash("3") }],
    capturedAtSec: nowSec - 20, expiresAtSec: nowSec + 40 };
  const freshInput = { ...inputIdentity, blockNumber: "1010", blockHash: hash("b"),
    capturedAtSec: nowSec, expiresAtSec: nowSec + 30 };
  const freshOutput = { ...outputIdentity, blockNumber: "1010", blockHash: hash("b"),
    capturedAtSec: nowSec, expiresAtSec: nowSec + 30 };
  const freshValuation = { ...valuation, assetIdentityHash: commitment(freshInput),
    capturedAtSec: nowSec, expiresAtSec: nowSec + 30, conservativeValueUsdE8: "210",
    quotes: valuation.quotes.map((quote) => ({ ...quote, fetchedAtSec: nowSec,
      expiresAtSec: nowSec + 30 })) };
  const eligibility = vi.fn(async ({ token }: { token: `0x${string}`; inputAtomic?: string }) => ({
    status: "eligible" as const,
    identityHash: commitment(token === inputToken ? freshInput : freshOutput),
    identityEvidence: token === inputToken ? freshInput : freshOutput,
    ...(token === inputToken ? { valuationHash: commitment(freshValuation),
      valuationEvidence: freshValuation } : {}),
  }));
  return { input: { nowSec, policy: { maximumInputUsdE8: "250", inputIdentityHash: commitment(inputIdentity),
      inputValuationHash: commitment(valuation), outputs: [{ chainId: 196 as const, token: outputToken,
        identityHash: commitment(outputIdentity) }] },
    stage: { index: 0, chainId: 196 as const, target, targetRuntimeCodeHash: hash("4"),
      input: { token: inputToken, maximumAtomic: "100", maximumUsdE8: "250",
        identityEvidenceHash: commitment(inputIdentity), valuationEvidenceHash: commitment(valuation) },
      outputs: [{ token: outputToken, identityEvidenceHash: commitment(outputIdentity) }] },
    evidence: { identities: [inputIdentity, outputIdentity], valuations: [valuation] },
    programIdentityEvidenceHashes: [commitment(inputIdentity), commitment(outputIdentity)],
    programValuationEvidenceHashes: [commitment(valuation)],
    eligibility: { eligibility }, reader: { blockHash: vi.fn(async () => hash("b")),
      codeHash: vi.fn(async () => hash("4")) } }, eligibility };
}

describe("V4 stage evidence revalidation", () => {
  it("accepts fresh matching token, target, price cap, and canonical block evidence", async () => {
    const value = fixture();
    await expect(revalidateStageEvidenceV4(value.input)).resolves.toEqual({
      pinnedBlockNumber: "1010", pinnedBlockHash: hash("b"),
      identityHash: value.input.policy.inputIdentityHash,
      valuationHash: value.input.policy.inputValuationHash,
    });
    expect(value.eligibility).toHaveBeenCalledWith({ chainId: 196, token: inputToken, inputAtomic: "100" });
    expect(value.eligibility).toHaveBeenCalledWith({ chainId: 196, token: outputToken });
  });

  it("rejects runtime and proxy identity drift", async () => {
    const runtime = fixture();
    runtime.eligibility.mockImplementation(async ({ token }) => {
      const base = await fixture().eligibility({ token });
      if (token !== inputToken) return base;
      const identityEvidence = { ...base.identityEvidence, runtimeCodeHash: hash("f") };
      return { ...base, identityHash: commitment(identityEvidence), identityEvidence };
    });
    await expect(revalidateStageEvidenceV4(runtime.input)).rejects.toThrow(/identity/i);

    const proxy = fixture();
    proxy.eligibility.mockImplementation(async ({ token }) => {
      const base = await fixture().eligibility({ token });
      if (token !== inputToken) return base;
      const identityEvidence = { ...base.identityEvidence, proxy: { kind: "eip1967" as const,
        implementation: target, implementationRuntimeCodeHash: hash("e"), admin: null } };
      return { ...base, identityHash: commitment(identityEvidence), identityEvidence };
    });
    await expect(revalidateStageEvidenceV4(proxy.input)).rejects.toThrow(/identity/i);
  });

  it("rejects target, price cap, expiry, and canonical block drift", async () => {
    const targetDrift = fixture(); targetDrift.input.reader.codeHash = vi.fn(async () => hash("f"));
    await expect(revalidateStageEvidenceV4(targetDrift.input)).rejects.toThrow(/target/i);

    const price = fixture();
    price.eligibility.mockImplementation(async (request) => {
      const base = await fixture().eligibility(request);
      if (request.token !== inputToken) return base;
      const valuationEvidence = { ...base.valuationEvidence!, conservativeValueUsdE8: "251" };
      return { ...base, valuationHash: commitment(valuationEvidence), valuationEvidence };
    });
    await expect(revalidateStageEvidenceV4(price.input)).rejects.toThrow(/USD cap/i);

    const expired = fixture();
    expired.eligibility.mockImplementation(async (request) => {
      const base = await fixture().eligibility(request);
      if (request.token !== inputToken) return base;
      const valuationEvidence = { ...base.valuationEvidence!, capturedAtSec: nowSec - 20,
        expiresAtSec: nowSec, quotes: base.valuationEvidence!.quotes.map((quote) => ({
          ...quote, fetchedAtSec: nowSec - 20, expiresAtSec: nowSec,
        })) };
      return { ...base, valuationHash: commitment(valuationEvidence), valuationEvidence };
    });
    await expect(revalidateStageEvidenceV4(expired.input)).rejects.toThrow(/stale/i);

    const block = fixture(); block.input.reader.blockHash = vi.fn(async () => hash("f"));
    await expect(revalidateStageEvidenceV4(block.input)).rejects.toThrow(/block hash/i);
  });
});
