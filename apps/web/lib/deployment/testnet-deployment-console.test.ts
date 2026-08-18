import { parseAbi, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { buildAgentExecutorDeploymentPlanV1 } from "./agent-executor-plan";
import { renderTestnetDeploymentConsole } from "./testnet-deployment-console";

const deployer = "0x1111111111111111111111111111111111111111" as const;
const verifier = "0x3333333333333333333333333333333333333333" as const;
const canary = "0x4444444444444444444444444444444444444444" as const;
const bytecode = "0x60006000f3" as Hex;

describe("testnet deployment console", () => {
  it("binds wallet confirmations to chain 1952 and the exact plan", () => {
    const plan = buildAgentExecutorDeploymentPlanV1({
      chainId: 1952,
      deployer,
      deployerNonce: 0n,
      owner: deployer,
      verifier,
      canaryWallet: canary,
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
    const html = renderTestnetDeploymentConsole({ plan, maxFeePerGas: 40_000_002n });

    expect(html).toContain("X Layer Testnet");
    expect(html).toContain("0x7a0");
    expect(html).toContain(plan.registry);
    expect(html).toContain("eth_sendTransaction");
    expect(html).toContain("eth_getTransactionCount");
    expect(html).toContain("accountsChanged");
    expect(html).toContain("tryAuthorizedAccount");
    expect(html).toContain("wallet_addEthereumChain");
    expect(html).toContain("https://testrpc.xlayer.tech/terigon");
    expect(html).toContain("https://www.okx.com/web3/explorer/xlayer-test");
    expect(html.indexOf("wallet_switchEthereumChain")).toBeLessThan(
      html.indexOf("eth_requestAccounts"),
    );
    expect(html).toContain("connect-src 'none'");
    expect(html).not.toContain("eth_sendRawTransaction");
    expect(html).not.toMatch(/private.?key/i);
    expect(html).not.toContain("0xc4");
  });
});
