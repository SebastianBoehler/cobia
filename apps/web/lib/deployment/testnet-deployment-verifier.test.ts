import { parseAbi, type Address, type Hash, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { buildAgentExecutorDeploymentPlanV1 } from "./agent-executor-plan";
import {
  verifyTestnetDeployment,
  type TestnetDeploymentReader,
} from "./testnet-deployment-verifier";

const deployer = "0x1111111111111111111111111111111111111111" as const;
const verifier = "0x3333333333333333333333333333333333333333" as const;
const canary = "0x4444444444444444444444444444444444444444" as const;
const bytecode = "0x60006000f3" as Hex;
const hashes = [1, 2, 3, 4].map((value) =>
  `0x${value.toString(16).padStart(64, "0")}` as Hash
);

function fixture() {
  const plan = buildAgentExecutorDeploymentPlanV1({
    chainId: 1952,
    deployer,
    deployerNonce: 7n,
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
  const transactions = new Map<Hash, {
    from: Address; to: Address | null; input: Hex; nonce: bigint; value: bigint;
  }>();
  const receipts = new Map<Hash, {
    status: "success" | "reverted"; contractAddress: Address | null;
    blockNumber: bigint; blockHash: Hash;
  }>();
  for (const [index, deployment] of plan.deployments.entries()) {
    transactions.set(hashes[index], {
      from: deployer,
      to: null,
      input: deployment.data,
      nonce: BigInt(deployment.nonce),
      value: 0n,
    });
    receipts.set(hashes[index], {
      status: "success",
      contractAddress: deployment.expectedContract,
      blockNumber: BigInt(100 + index),
      blockHash: `0x${(10 + index).toString(16).padStart(64, "0")}` as Hash,
    });
  }
  const pause = plan.proposalTransactions[0];
  transactions.set(hashes[3], {
    from: deployer,
    to: pause.to,
    input: pause.data,
    nonce: 10n,
    value: 0n,
  });
  receipts.set(hashes[3], {
    status: "success",
    contractAddress: null,
    blockNumber: 103n,
    blockHash: `0x${"13".repeat(32)}`,
  });
  const values = new Map<string, unknown>([
    [`${plan.registry}:owner`, deployer],
    [`${plan.registry}:paused`, true],
    [`${plan.riskManager}:owner`, deployer],
    [`${plan.riskManager}:paused`, true],
    [`${plan.riskManager}:executor`, plan.executor],
    [`${plan.riskManager}:verifierSigner`, verifier],
    [`${plan.executor}:registry`, plan.registry],
    [`${plan.executor}:riskManager`, plan.riskManager],
  ]);
  const reader: TestnetDeploymentReader = {
    chainId: async () => 1952,
    transaction: async (hash) => transactions.get(hash)!,
    receipt: async (hash) => receipts.get(hash)!,
    blockHash: async (blockNumber) => [...receipts.values()]
      .find((receipt) => receipt.blockNumber === blockNumber)!.blockHash,
    code: async () => "0x6000",
    contractValue: async (address, field) => values.get(`${address}:${field}`),
  };
  return { plan, reader, transactions, receipts, values };
}

function receiptEvidence(value: ReturnType<typeof fixture>) {
  const references = hashes.map((transactionHash) => {
    const receipt = value.receipts.get(transactionHash)!;
    return { transactionHash, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash };
  });
  return { deployments: references.slice(0, 3), pauseRegistry: references[3] };
}

describe("testnet deployment verifier", () => {
  it("accepts exact successful creations and a paused empty registry", async () => {
    const value = fixture();
    const evidence = await verifyTestnetDeployment({
      plan: value.plan,
      reader: value.reader,
      receiptEvidence: receiptEvidence(value),
    });

    expect(evidence.chainId).toBe(1952);
    expect(evidence.contracts).toHaveLength(3);
    expect(evidence.pauseRegistryTransaction).toBe(hashes[3]);
  });

  it.each([
    ["chain", (value: ReturnType<typeof fixture>) => {
      value.reader.chainId = async () => 196;
    }, "Testnet RPC chain mismatch"],
    ["creation input", (value: ReturnType<typeof fixture>) => {
      value.transactions.get(hashes[0])!.input = "0xdeadbeef";
    }, "Deployment transaction does not match the plan"],
    ["pause state", (value: ReturnType<typeof fixture>) => {
      value.values.set(`${value.plan.registry}:paused`, false);
    }, "Registry is not paused"],
    ["executor binding", (value: ReturnType<typeof fixture>) => {
      value.values.set(`${value.plan.riskManager}:executor`, canary);
    }, "Risk manager executor binding mismatch"],
    ["reorged receipt", (value: ReturnType<typeof fixture>) => {
      value.reader.blockHash = async () => `0x${"ff".repeat(32)}`;
    }, "Receipt block is not canonical"],
  ])("rejects %s evidence", async (_name, mutate, message) => {
    const value = fixture();
    mutate(value);
    await expect(verifyTestnetDeployment({
      plan: value.plan,
      reader: value.reader,
      receiptEvidence: receiptEvidence(value),
    })).rejects.toThrow(message);
  });

  it("rejects a supplied receipt anchor that changed before verification", async () => {
    const value = fixture();
    const evidence = receiptEvidence(value);
    evidence.deployments[1].blockHash = `0x${"ee".repeat(32)}`;
    await expect(verifyTestnetDeployment({
      plan: value.plan,
      reader: value.reader,
      receiptEvidence: evidence,
    })).rejects.toThrow("Supplied receipt anchor is not canonical");
  });
});
