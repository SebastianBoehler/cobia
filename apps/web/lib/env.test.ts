import { keccak256, toHex } from "viem";
import { describe, expect, it } from "vitest";
import {
  readAgenticSolverConfig,
  readCodingAgentRpcProxyConfig,
  readExecutionSessionSecret,
  readMarketConfig,
} from "./env";

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

  it("requires a dedicated high-entropy execution session secret", () => {
    const secret = "11".repeat(32);
    expect(readExecutionSessionSecret({ EXECUTION_SESSION_SECRET: secret })).toBe(secret);
    expect(() => readExecutionSessionSecret({ EXECUTION_SESSION_SECRET: "short" }))
      .toThrow("EXECUTION_SESSION_SECRET");
  });

  it("requires an exact Vercel identity and public origin for the sandbox RPC proxy", () => {
    expect(readCodingAgentRpcProxyConfig({
      CODING_AGENT_PUBLIC_ORIGIN: "https://cobia.example",
      VERCEL_TEAM_ID: "team_1",
      VERCEL_PROJECT_ID: "prj_1",
      XLAYER_RPC_URL: "https://rpc.example/secret",
    })).toEqual({
      CODING_AGENT_PUBLIC_ORIGIN: "https://cobia.example",
      VERCEL_TEAM_ID: "team_1",
      VERCEL_PROJECT_ID: "prj_1",
      XLAYER_RPC_URL: "https://rpc.example/secret",
    });
    expect(() => readCodingAgentRpcProxyConfig({
      CODING_AGENT_PUBLIC_ORIGIN: "http://cobia.example",
      VERCEL_TEAM_ID: "team_1",
      VERCEL_PROJECT_ID: "prj_1",
      XLAYER_RPC_URL: "https://rpc.example",
    })).toThrow("CODING_AGENT_PUBLIC_ORIGIN");
  });
});
