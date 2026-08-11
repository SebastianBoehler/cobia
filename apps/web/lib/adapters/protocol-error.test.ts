import { describe, expect, it } from "vitest";
import {
  PROTOCOL_INELIGIBLE_CODES,
  ProtocolIneligibleError,
} from "./protocol-error";

describe("ProtocolIneligibleError", () => {
  it("exposes only the snapshot-skippable protocol conditions", () => {
    expect(PROTOCOL_INELIGIBLE_CODES).toEqual([
      "aave-reserve-inactive",
      "aave-reserve-frozen",
      "aave-reserve-paused",
      "aave-zero-scaled-amount",
      "aave-supply-cap-exceeded",
      "uniswap-pool-locked",
      "uniswap-zero-liquidity",
      "uniswap-zero-output",
    ]);
  });

  it("rejects construction with a code outside the closed set", () => {
    expect(() => new ProtocolIneligibleError("rpc-failure" as never, "RPC failed"))
      .toThrow("Unknown protocol ineligibility code");
  });
});
