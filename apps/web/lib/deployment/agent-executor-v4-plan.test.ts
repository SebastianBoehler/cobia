import { describe, expect, it } from "vitest";
import { keccak256, stringToHex, type Abi } from "viem";
import { buildAgentExecutorDeploymentPlanV4 } from "./agent-executor-v4-plan";

const address = (byte: string) => `0x${byte.repeat(40)}` as `0x${string}`;
const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const riskArtifact = { abi: [{ type: "constructor", stateMutability: "nonpayable", inputs: [
  { name: "owner", type: "address" }, { name: "executor", type: "address" },
  { name: "verifier", type: "address" },
] }] as Abi, bytecode: "0x6000" as const };
const executorArtifact = { abi: [{ type: "constructor", stateMutability: "nonpayable", inputs: [
  { name: "registry", type: "address" }, { name: "risk", type: "address" },
] }] as Abi, bytecode: "0x6000" as const };

describe("agent executor V4 deployment plan", () => {
  it.each([1, 196] as const)("builds unsigned deterministic chain %s canary and open calls", (chainId) => {
    const adapterId = keccak256(stringToHex("lifi.route@1"));
    const plan = buildAgentExecutorDeploymentPlanV4({ chainId, deployer: address("1"), deployerNonce: 7n,
      owner: address("2"), verifier: address("3"), canaryWallet: address("4"), registry: address("5"),
      artifacts: { riskManager: riskArtifact, executor: executorArtifact },
      adapters: [{ adapterId, target: address("6"), selector: "0x12345678", runtimeCodeHash: hash("7") }],
    });

    expect(plan).toMatchObject({ version: 4, chainId, owner: address("2"), verifier: address("3"),
      registry: address("5"), limitsUsdE8: { route: "100000000000", wallet24h: "500000000000",
        protocol24h: "5000000000000" }, activationDelaySeconds: 172800 });
    expect(plan.deployments).toHaveLength(2);
    expect(plan.proposalTransactions.map(({ label }) => label)).toEqual([
      "propose-adapter-0", "propose-canary-wallet", "propose-unpause",
    ]);
    expect(plan.activationTransactions.map(({ label }) => label)).toEqual([
      "activate-adapter-0", "activate-canary-wallet", "activate-unpause",
    ]);
    expect(plan.openProposalTransaction.label).toBe("propose-open-access");
    expect(plan.openActivationTransaction.label).toBe("activate-open-access");
    expect(JSON.stringify(plan)).not.toContain("privateKey");
  });

  it("rejects duplicate or incomplete adapter authority", () => {
    const adapter = { adapterId: hash("7"), target: address("6"), selector: "0x12345678" as const,
      runtimeCodeHash: hash("8") };
    expect(() => buildAgentExecutorDeploymentPlanV4({ chainId: 196, deployer: address("1"), deployerNonce: 0n,
      owner: address("2"), verifier: address("3"), canaryWallet: address("4"), registry: address("5"),
      artifacts: { riskManager: riskArtifact, executor: executorArtifact }, adapters: [adapter, adapter],
    })).toThrow(/unique/i);
  });
});
