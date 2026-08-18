import { parseAbi, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { buildAgentExecutorDeploymentPlanV1 } from "./agent-executor-plan";

const deployer = "0x1111111111111111111111111111111111111111" as const;
const owner = "0x2222222222222222222222222222222222222222" as const;
const verifier = "0x3333333333333333333333333333333333333333" as const;
const wallet = "0x4444444444444444444444444444444444444444" as const;
const target = "0x5555555555555555555555555555555555555555" as const;
const token = "0x6666666666666666666666666666666666666666" as const;
const bytecode = "0x60006000f3" as Hex;

describe("agent executor deployment plan", () => {
  it("predicts the circular executor address and separates delayed activation", () => {
    const plan = buildAgentExecutorDeploymentPlanV1({
      chainId: 196,
      deployer,
      deployerNonce: 7n,
      owner,
      verifier,
      canaryWallet: wallet,
      artifacts: {
        registry: { abi: parseAbi(["constructor(address initialOwner)"]), bytecode },
        riskManager: {
          abi: parseAbi(["constructor(address initialOwner,address executor,address verifier)"]),
          bytecode,
        },
        executor: {
          abi: parseAbi(["constructor(address registry,address riskManager)"]),
          bytecode,
        },
      },
      capabilities: [{
        id: "protocol.action",
        version: 1,
        target,
        selector: "0x12345678",
        runtimeCodeHash: `0x${"77".repeat(32)}`,
      }],
      tokens: [{ token, maxRoute: 10n, maxWalletDaily: 50n, maxCumulative: 1_000n }],
    });

    expect(plan.chainId).toBe(196);
    expect(plan.deployments.map(({ nonce }) => nonce)).toEqual(["7", "8", "9"]);
    expect(plan.riskManager).not.toBe(plan.executor);
    expect(plan.deploymentInputs.riskManagerExecutor).toBe(plan.executor);
    expect(plan.proposalTransactions.map(({ label }) => label)).toEqual([
      "pause-registry",
      "propose-protocol.action@1",
      "propose-token-0",
      "propose-canary-wallet",
      "propose-unpause",
    ]);
    expect(plan.activationTransactions.map(({ label }) => label)).toEqual([
      "activate-protocol.action@1",
      "activate-token-0",
      "activate-canary-wallet",
      "activate-unpause",
      "unpause-registry",
    ]);
    expect(JSON.stringify(plan)).not.toContain("privateKey");
  });

  it("builds a paused empty testnet deployment without activation calls", () => {
    const plan = buildAgentExecutorDeploymentPlanV1({
      chainId: 1952,
      deployer,
      deployerNonce: 11n,
      owner: deployer,
      verifier,
      canaryWallet: wallet,
      artifacts: {
        registry: { abi: parseAbi(["constructor(address initialOwner)"]), bytecode },
        riskManager: {
          abi: parseAbi(["constructor(address initialOwner,address executor,address verifier)"]),
          bytecode,
        },
        executor: {
          abi: parseAbi(["constructor(address registry,address riskManager)"]),
          bytecode,
        },
      },
      capabilities: [],
      tokens: [],
    });

    expect(plan.chainId).toBe(1952);
    expect(plan.proposalTransactions.map(({ label }) => label)).toEqual(["pause-registry"]);
    expect(plan.activationTransactions).toEqual([]);
  });

  it("rejects protocol permissions on testnet and empty production plans", () => {
    const base = {
      deployer,
      deployerNonce: 7n,
      owner,
      verifier,
      canaryWallet: wallet,
      artifacts: {
        registry: { abi: parseAbi(["constructor(address initialOwner)"]), bytecode },
        riskManager: {
          abi: parseAbi(["constructor(address initialOwner,address executor,address verifier)"]),
          bytecode,
        },
        executor: {
          abi: parseAbi(["constructor(address registry,address riskManager)"]),
          bytecode,
        },
      },
    } as const;

    expect(() => buildAgentExecutorDeploymentPlanV1({
      ...base,
      chainId: 1952,
      capabilities: [{
        id: "protocol.action",
        version: 1,
        target,
        selector: "0x12345678",
        runtimeCodeHash: `0x${"77".repeat(32)}`,
      }],
      tokens: [],
    })).toThrow("Testnet deployment must not contain protocol activation data");

    expect(() => buildAgentExecutorDeploymentPlanV1({
      ...base,
      chainId: 196,
      capabilities: [],
      tokens: [],
    })).toThrow("Production deployment plan is incomplete");

    expect(() => buildAgentExecutorDeploymentPlanV1({
      ...base,
      chainId: 1952,
      owner,
      capabilities: [],
      tokens: [],
    })).toThrow("Testnet deployer must be the temporary owner");
  });
});
