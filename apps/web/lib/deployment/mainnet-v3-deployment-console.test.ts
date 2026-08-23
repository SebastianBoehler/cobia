import { parseAbi, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { buildAgentExecutorDeploymentPlanV3 } from "./agent-executor-v3-plan";
import {
  renderMainnetDeploymentConsole,
  renderMainnetV3DeploymentConsole,
} from "./mainnet-v3-deployment-console";

describe("V3 mainnet wallet console", () => {
  it("renders only the two committed creations for separate wallet confirmation", () => {
    const bytecode = "0x60006000f3" as Hex;
    const plan = buildAgentExecutorDeploymentPlanV3({
      deployer: "0x1111111111111111111111111111111111111111", deployerNonce: 5n,
      owner: "0x2222222222222222222222222222222222222222",
      verifier: "0x3333333333333333333333333333333333333333",
      canaryWallet: "0x4444444444444444444444444444444444444444",
      registry: "0x5555555555555555555555555555555555555555",
      artifacts: {
        riskManager: { abi: parseAbi(["constructor(address,address,address)"]), bytecode },
        executor: { abi: parseAbi(["constructor(address,address)"]), bytecode },
      },
      capabilityPermissionKeys: [`0x${"66".repeat(32)}`],
      tokens: [{ token: "0x7777777777777777777777777777777777777777", maxRoute: 1n, maxWalletDaily: 2n, maxCumulative: 3n }],
    });
    const html = renderMainnetV3DeploymentConsole({ plan, maxFeePerGas: 2_000_000_000n });

    expect(html).toContain("chain 196");
    expect(html).toContain(plan.riskManager);
    expect(html).toContain(plan.executor);
    expect(html).toContain("eth_sendTransaction");
    expect(html).not.toMatch(/eth_sendRawTransaction|privateKey|seed phrase/i);
  });

  it("renders the reviewed V4 deployment labels and gas caps", () => {
    const html = renderMainnetDeploymentConsole({
      plan: {
        version: 4,
        chainId: 196,
        deployer: "0x1111111111111111111111111111111111111111",
        owner: "0x2222222222222222222222222222222222222222",
        verifier: "0x3333333333333333333333333333333333333333",
        registry: "0x4444444444444444444444444444444444444444",
        deployments: [
          { label: "deploy-risk-manager-v2", nonce: "13",
            expectedContract: "0x5555555555555555555555555555555555555555",
            value: "0x0", data: "0x6000" },
          { label: "deploy-executor-v4", nonce: "14",
            expectedContract: "0x6666666666666666666666666666666666666666",
            value: "0x0", data: "0x6001" },
        ],
      },
      maxFeePerGas: 2_000_000_000n,
    });

    expect(html).toContain("Cobia Executor V4 deployment");
    expect(html).toContain("deploy-risk-manager-v2");
    expect(html).toContain("deploy-executor-v4");
    expect(html).toContain('"gas":"0x3d0900"');
  });
});
