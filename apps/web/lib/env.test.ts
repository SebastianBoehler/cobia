import { keccak256, toHex } from "viem";
import { describe, expect, it } from "vitest";
import { readAgenticSolverConfig, readMarketConfig } from "./env";

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

  it("requires an independent signer and explicit OpenAI model for the agentic solver", () => {
    const agenticSigner = keccak256(toHex("cobia-agentic-env-test-signer"));
    expect(readAgenticSolverConfig({
      OPENAI_API_KEY: "test-key",
      OPENAI_SOLVER_MODEL: "gpt-test",
      AI_SOLVER_PRIVATE_KEY: agenticSigner,
    })).toEqual({
      OPENAI_API_KEY: "test-key",
      OPENAI_SOLVER_MODEL: "gpt-test",
      AI_SOLVER_PRIVATE_KEY: agenticSigner,
    });
    expect(() => readAgenticSolverConfig({
      OPENAI_API_KEY: "test-key",
      OPENAI_SOLVER_MODEL: "gpt-test",
    })).toThrow("AI_SOLVER_PRIVATE_KEY");
  });
});
