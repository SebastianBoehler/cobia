import { keccak256, toHex } from "viem";
import { describe, expect, it } from "vitest";
import {
  readAgenticSolverConfig,
  readCodingAgentRpcProxyConfig,
  readCodingAgentRuntimeConfig,
  readCodingAgentV3ExecutionConfig,
  readCodingAgentV3RuntimeConfig,
  readExecutionSessionSecret,
  readMarketConfig,
  readWalletAuthSecret,
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
      ETHEREUM_RPC_URL: "https://ethereum-rpc.publicnode.com",
      BASE_RPC_URL: "https://mainnet.base.org",
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

  it("requires a separate high-entropy wallet authentication secret", () => {
    const secret = "22".repeat(32);
    expect(readWalletAuthSecret({ WALLET_AUTH_SECRET: secret })).toBe(secret);
    expect(() => readWalletAuthSecret({ WALLET_AUTH_SECRET: "short" }))
      .toThrow("WALLET_AUTH_SECRET");
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

  it("separates verifier attestation from wallet authority", () => {
    const verifier = keccak256(toHex("cobia-verifier"));
    expect(readCodingAgentRuntimeConfig({
      OPENAI_API_KEY: "test-key",
      OPENAI_CODING_AGENT_MODEL: "gpt-test",
      COBIA_EXECUTOR_V2_ADDRESS: "0x1111111111111111111111111111111111111111",
      COBIA_EXECUTOR_V2_CODE_HASH: `0x${"22".repeat(32)}`,
      COBIA_VERIFIER_PRIVATE_KEY: verifier,
      CODING_AGENT_PUBLIC_ORIGIN: "https://cobia.example",
    })).toMatchObject({
      COBIA_VERIFIER_PRIVATE_KEY: verifier,
      XLAYER_RPC_URL: "https://rpc.xlayer.tech",
    });
    expect(() => readCodingAgentRuntimeConfig({
      OPENAI_API_KEY: "test-key",
      OPENAI_CODING_AGENT_MODEL: "gpt-test",
      COBIA_EXECUTOR_V2_ADDRESS: "0x1111111111111111111111111111111111111111",
      COBIA_EXECUTOR_V2_CODE_HASH: `0x${"22".repeat(32)}`,
      CODING_AGENT_PUBLIC_ORIGIN: "https://cobia.example",
    })).toThrow("COBIA_VERIFIER_PRIVATE_KEY");
  });

  it("requires an explicit V3 mainnet deployment identity without a V2 fallback", () => {
    const verifier = keccak256(toHex("cobia-v3-verifier"));
    expect(readCodingAgentV3ExecutionConfig({
      COBIA_EXECUTOR_V3_ADDRESS: "0x3333333333333333333333333333333333333333",
      COBIA_EXECUTOR_V3_CODE_HASH: `0x${"44".repeat(32)}`,
      COBIA_VERIFIER_PRIVATE_KEY: verifier,
    })).toEqual({
      COBIA_EXECUTOR_V3_ADDRESS: "0x3333333333333333333333333333333333333333",
      COBIA_EXECUTOR_V3_CODE_HASH: `0x${"44".repeat(32)}`,
      COBIA_VERIFIER_PRIVATE_KEY: verifier,
      XLAYER_RPC_URL: "https://rpc.xlayer.tech",
      ETHEREUM_RPC_URL: "https://ethereum-rpc.publicnode.com",
      BASE_RPC_URL: "https://mainnet.base.org",
    });
    expect(() => readCodingAgentV3ExecutionConfig({
      COBIA_EXECUTOR_V2_ADDRESS: "0x1111111111111111111111111111111111111111",
      COBIA_EXECUTOR_V2_CODE_HASH: `0x${"22".repeat(32)}`,
      COBIA_VERIFIER_PRIVATE_KEY: verifier,
    })).toThrow("COBIA_EXECUTOR_V3_ADDRESS");
  });

  it("requires the complete V3 sandbox runtime separately from execution-only reads", () => {
    const verifier = keccak256(toHex("cobia-v3-runtime-verifier"));
    expect(readCodingAgentV3RuntimeConfig({
      OPENAI_API_KEY: "test-key",
      OPENAI_CODING_AGENT_MODEL: "gpt-test",
      COBIA_EXECUTOR_V3_ADDRESS: "0x3333333333333333333333333333333333333333",
      COBIA_EXECUTOR_V3_CODE_HASH: `0x${"44".repeat(32)}`,
      COBIA_VERIFIER_PRIVATE_KEY: verifier,
      CODING_AGENT_PUBLIC_ORIGIN: "https://cobia.example",
    })).toMatchObject({
      OPENAI_CODING_AGENT_MODEL: "gpt-test",
      COBIA_EXECUTOR_V3_ADDRESS: "0x3333333333333333333333333333333333333333",
      CODING_AGENT_PUBLIC_ORIGIN: "https://cobia.example",
    });
    expect(() => readCodingAgentV3RuntimeConfig({
      COBIA_EXECUTOR_V3_ADDRESS: "0x3333333333333333333333333333333333333333",
      COBIA_EXECUTOR_V3_CODE_HASH: `0x${"44".repeat(32)}`,
      COBIA_VERIFIER_PRIVATE_KEY: verifier,
    })).toThrow("OPENAI_API_KEY");
  });
});
