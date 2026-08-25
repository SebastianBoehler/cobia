import { AssetIdentityEvidenceV1Schema, AssetValuationEvidenceV1Schema, commitment } from "@cobia/domain";
import { describe, expect, it, vi } from "vitest";
import { compileGeneralAssetRequestV1 } from "./compile-general-asset-request";

const inputToken = "0x2222222222222222222222222222222222222222" as const;
const outputToken = "0x3333333333333333333333333333333333333333" as const;
const owner = "0x1111111111111111111111111111111111111111" as const;
const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;

function deps(status: "eligible" | "unsupported" = "eligible") {
  const searchToken = vi.fn(async (chainId: 1 | 196, search: string) => ({ chainId,
    token: search as `0x${string}`, name: "Token", symbol: search === inputToken ? "IN" : "OUT",
    decimals: 18, priceUsd: undefined, liquidityUsd: undefined, holderCount: undefined }));
  const identity = (token: typeof inputToken | typeof outputToken) => AssetIdentityEvidenceV1Schema.parse({
    version: 1, chainId: 196, token, runtimeCodeHash: token === inputToken ? hash("1") : hash("2"),
    proxy: { kind: "none" }, decimals: 18, behaviorModule: { id: "plain-erc20", version: 1 },
    blockNumber: "123", blockHash: hash("5"), capturedAtSec: 2_000_000_000,
    expiresAtSec: 2_000_000_030,
  });
  const eligibility = vi.fn(async ({ token, inputAtomic }: { token: typeof inputToken | typeof outputToken;
    inputAtomic?: string }) => {
    if (status === "unsupported") return { status: "unsupported" as const,
      reason: "Token behavior is unsupported." };
    const identityEvidence = identity(token);
    if (!inputAtomic) return { status: "eligible" as const,
      identityHash: commitment(identityEvidence), identityEvidence };
    const valuationEvidence = AssetValuationEvidenceV1Schema.parse({ version: 1,
      assetIdentityHash: commitment(identityEvidence), referenceAsset: { chainId: 196, token: outputToken },
      inputAtomic, conservativeValueUsdE8: "250000000", maximumDisagreementBps: 0,
      quotes: [{ adapter: { id: "okx.swap", version: 1 }, outputAtomic: "1",
        referenceValueUsdE8: "250000000", liquidityUsdE8: "100000000", priceImpactBps: 0,
        fetchedAtSec: 2_000_000_000, expiresAtSec: 2_000_000_030, quoteHash: hash("3") }],
      capturedAtSec: 2_000_000_000, expiresAtSec: 2_000_000_030,
    });
    return { status: "eligible" as const, identityHash: commitment(identityEvidence),
      identityEvidence, valuationHash: commitment(valuationEvidence), valuationEvidence };
  });
  const manifest = { version: 1 as const, entries: [{ providerFamily: "okx" as const,
    adapter: { id: "okx.swap", version: 1 }, chainId: 196 as const,
    target: "0x4444444444444444444444444444444444444444" as const,
    runtimeCodeHash: hash("4"), selectors: ["0x12345678" as const], approvalSpenders: [{
      address: "0x5555555555555555555555555555555555555555" as const, runtimeCodeHash: hash("6") }],
  }] };
  return { lookup: { searchToken }, verifier: { eligibility } as never, manifest };
}

const input = { owner, goal: "Swap exact tokens",
  input: { chainId: 196 as const, address: inputToken, maximumAtomic: "1000000000000000000" },
  output: { chainId: 196 as const, address: outputToken, minimumAtomic: "1" } };

describe("general asset compile request", () => {
  it("returns the exact server evidence preimage and its signing expiry", async () => {
    const dependencies = deps();
    const result = await compileGeneralAssetRequestV1(input, dependencies);

    expect(result).toMatchObject({ status: "review", values: {
      input: { token: inputToken, maximumUsdE8: "250000000" }, output: { token: outputToken },
      manifestHash: commitment(dependencies.manifest), evidenceExpiresAtSec: 2_000_000_030,
    }, evidenceExpiresAtSec: 2_000_000_030, generalAssetEvidence: { identities: [
      expect.objectContaining({ token: inputToken }), expect.objectContaining({ token: outputToken }),
    ] } });
    expect(dependencies.lookup.searchToken).toHaveBeenNthCalledWith(1, 196, inputToken);
    expect(dependencies.lookup.searchToken).toHaveBeenNthCalledWith(2, 196, outputToken);
  });

  it("returns the explicit verifier reason for an unsupported input", async () => {
    await expect(compileGeneralAssetRequestV1(input, deps("unsupported"))).resolves.toEqual({
      status: "clarification", question: "Token behavior is unsupported.",
    });
  });
});
