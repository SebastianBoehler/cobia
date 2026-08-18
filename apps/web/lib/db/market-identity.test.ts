import { describe, expect, it } from "vitest";
import { USDG_ADDRESS } from "../chain/xlayer";
import { marketIdentity, verifyStoredMarketIdentity } from "./market-identity";

const expected = {
  executionChainId: 196 as const,
  asset: USDG_ADDRESS,
};

describe("stored market identity verification", () => {
  it("accepts the canonical row for a signed policy", () => {
    expect(() => verifyStoredMarketIdentity({
      id: `196:${USDG_ADDRESS.toLowerCase()}`,
      executionChainId: 196,
      asset: USDG_ADDRESS.toLowerCase(),
    }, expected)).not.toThrow();
  });

  it.each([
    { id: `196:${USDG_ADDRESS.toLowerCase()}`, executionChainId: 1952, asset: USDG_ADDRESS.toLowerCase() },
    { id: `196:${USDG_ADDRESS.toLowerCase()}`, executionChainId: 196, asset: "0x1111111111111111111111111111111111111111" },
  ])("rejects a conflicting stored row", (stored) => {
    expect(() => verifyStoredMarketIdentity(stored, expected))
      .toThrow("Stored market identity conflicts with the signed policy");
  });

  it("uses the signed input token for a general intent market", () => {
    const policy = {
      executionChainId: 196 as const,
      kind: "general-onchain" as const,
      input: { token: USDG_ADDRESS },
    };

    expect(marketIdentity(policy)).toBe(`196:${USDG_ADDRESS.toLowerCase()}`);
    expect(() => verifyStoredMarketIdentity({
      id: `196:${USDG_ADDRESS.toLowerCase()}`,
      executionChainId: 196,
      asset: USDG_ADDRESS.toLowerCase(),
    }, policy)).not.toThrow();
  });
});
