import { keccak256, toHex } from "viem";
import { describe, expect, it } from "vitest";
import { readMarketConfig } from "./env";

describe("market environment", () => {
  it("accepts the deterministic signer without AI solver configuration", () => {
    const deterministicSigner = keccak256(toHex("cobia-env-test-signer"));

    expect(
      readMarketConfig({
        DATABASE_URL: "postgresql://cobia:cobia@localhost:5432/cobia",
        DETERMINISTIC_SOLVER_PRIVATE_KEY: deterministicSigner,
      }),
    ).toEqual({
      DATABASE_URL: "postgresql://cobia:cobia@localhost:5432/cobia",
      DETERMINISTIC_SOLVER_PRIVATE_KEY: deterministicSigner,
      XLAYER_RPC_URL: "https://rpc.xlayer.tech",
    });
  });
});
