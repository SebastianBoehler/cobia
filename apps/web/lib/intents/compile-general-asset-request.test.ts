import { describe, expect, it, vi } from "vitest";
import { compileGeneralAssetRequestV1 } from "./compile-general-asset-request";

const inputToken = "0x2222222222222222222222222222222222222222" as const;
const outputToken = "0x3333333333333333333333333333333333333333" as const;
const owner = "0x1111111111111111111111111111111111111111" as const;
const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;

function deps(status: "eligible" | "unsupported" = "eligible") {
  const searchToken = vi.fn(async (chainId: 1 | 196, search: string) => ({ chainId,
    token: search as `0x${string}`, name: "Token", symbol: chainId === 1 ? "IN" : "OUT",
    decimals: 18, priceUsd: "2.5", liquidityUsd: "1000000", holderCount: undefined }));
  const eligibility = vi.fn(async ({ inputAtomic }: { inputAtomic?: string }) => status === "eligible"
    ? { status: "eligible" as const, identityHash: inputAtomic ? hash("1") : hash("2"),
      ...(inputAtomic ? { valuationHash: hash("3"), valuationEvidence: {
        conservativeValueUsdE8: "250000000",
      } } : {}) }
    : { status: "unsupported" as const, reason: "Token behavior is unsupported." });
  return { lookup: { searchToken }, verifier: { eligibility } as never, manifestHash: hash("4") };
}

const input = { owner, goal: "Swap exact tokens",
  input: { chainId: 1 as const, address: inputToken, maximumAtomic: "1000000000000000000" },
  output: { chainId: 196 as const, address: outputToken, minimumAtomic: "1" } };

describe("general asset compile request", () => {
  it("uses exact addresses and the server-computed USD maximum", async () => {
    const dependencies = deps();
    const result = await compileGeneralAssetRequestV1(input, dependencies);

    expect(result).toMatchObject({ status: "review", values: {
      input: { token: inputToken, maximumUsdE8: "250000000", identityHash: hash("1"),
        valuationHash: hash("3") },
      output: { token: outputToken, identityHash: hash("2") }, manifestHash: hash("4"),
    } });
    expect(dependencies.lookup.searchToken).toHaveBeenNthCalledWith(1, 1, inputToken);
    expect(dependencies.lookup.searchToken).toHaveBeenNthCalledWith(2, 196, outputToken);
  });

  it("returns the explicit verifier reason for an unsupported input", async () => {
    await expect(compileGeneralAssetRequestV1(input, deps("unsupported"))).resolves.toEqual({
      status: "clarification", question: "Token behavior is unsupported.",
    });
  });
});
