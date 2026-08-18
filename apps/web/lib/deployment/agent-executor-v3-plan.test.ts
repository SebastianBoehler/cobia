import { parseAbi, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { buildAgentExecutorDeploymentPlanV3 } from "./agent-executor-v3-plan";

const bytecode = "0x60006000f3" as Hex;
const input = {
  deployer: "0x1111111111111111111111111111111111111111" as const,
  deployerNonce: 5n,
  owner: "0x2222222222222222222222222222222222222222" as const,
  verifier: "0x3333333333333333333333333333333333333333" as const,
  canaryWallet: "0x4444444444444444444444444444444444444444" as const,
  registry: "0x5555555555555555555555555555555555555555" as const,
  artifacts: {
    riskManager: {
      abi: parseAbi(["constructor(address initialOwner,address executor,address verifier)"]), bytecode,
    },
    executor: { abi: parseAbi(["constructor(address registry,address riskManager)"]), bytecode },
  },
  capabilityPermissionKeys: [`0x${"66".repeat(32)}`] as const,
  tokens: [{
    token: "0x7777777777777777777777777777777777777777" as const,
    maxRoute: 10n, maxWalletDaily: 50n, maxCumulative: 1_000n,
  }],
};

describe("V3 mainnet executor upgrade plan", () => {
  it("reuses the Safe-owned registry but deploys a fresh executor-bound risk manager", () => {
    const plan = buildAgentExecutorDeploymentPlanV3(input);

    expect(plan.chainId).toBe(196);
    expect(plan.registry).toBe(input.registry);
    expect(plan.deployments.map(({ nonce }) => nonce)).toEqual(["5", "6"]);
    expect(plan.deploymentInputs.riskManagerExecutor).toBe(plan.executor);
    expect(plan.proposalTransactions.map(({ label }) => label)).toEqual([
      "propose-token-0", "propose-canary-wallet", "propose-unpause",
    ]);
    expect(plan.activationTransactions.map(({ label }) => label)).toEqual([
      "activate-capability-0", "activate-token-0", "activate-canary-wallet",
      "activate-unpause", "unpause-registry",
    ]);
    expect(JSON.stringify(plan)).not.toMatch(/privateKey|sendTransaction/);
  });

  it("rejects empty or unsafe production activation data", () => {
    expect(() => buildAgentExecutorDeploymentPlanV3({ ...input, tokens: [] })).toThrow(/incomplete/i);
    expect(() => buildAgentExecutorDeploymentPlanV3({ ...input, capabilityPermissionKeys: [] })).toThrow(/incomplete/i);
    expect(() => buildAgentExecutorDeploymentPlanV3({
      ...input, tokens: [{ ...input.tokens[0], maxRoute: 51n }],
    })).toThrow(/limits/i);
  });
});
