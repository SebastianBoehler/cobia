import { readFileSync } from "node:fs";
import {
  createPublicClient,
  getAddress,
  http,
  isHash,
  keccak256,
  parseAbi,
  toBytes,
  type Hash,
} from "viem";
import { buildAgentExecutorDeploymentPlanV1 } from "../lib/deployment/agent-executor-plan";
import {
  verifyTestnetDeployment,
  type TestnetDeploymentReader,
} from "../lib/deployment/testnet-deployment-verifier";
import { argument, executorArtifacts } from "./executor-deployment-input";

const OPERATOR = "0xB6da8E6d497bd3Bc5016416DA57d177085449124";
const VERIFIER = "0x1667d3e9a37655600eb4ee56BD2F5BAddC49fed4";
const CANARY = "0x9Afbf85e52612A9922617aDdA9569e13f565de31";
const REGISTRY_ABI = parseAbi(["function owner() view returns (address)", "function paused() view returns (bool)"]);
const RISK_ABI = parseAbi([
  "function owner() view returns (address)",
  "function paused() view returns (bool)",
  "function executor() view returns (address)",
  "function verifierSigner() view returns (address)",
]);
const EXECUTOR_ABI = parseAbi([
  "function registry() view returns (address)",
  "function riskManager() view returns (address)",
]);

interface ReceiptReference {
  label: string;
  transactionHash: Hash;
  blockNumber: bigint;
  blockHash: Hash;
}

function receiptReferences(path: string): { commitment: Hash; receipts: ReceiptReference[] } {
  const value = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  if (typeof value.commitment !== "string" || !isHash(value.commitment) ||
    !Array.isArray(value.receipts)) {
    throw new Error("Receipt evidence is malformed");
  }
  const receipts = value.receipts.map((item) => {
    if (typeof item !== "object" || item === null) throw new Error("Receipt evidence is malformed");
    const record = item as Record<string, unknown>;
    if (typeof record.label !== "string" || typeof record.transactionHash !== "string" ||
      !isHash(record.transactionHash) || typeof record.blockNumber !== "string" ||
      !/^\d+$/.test(record.blockNumber) || typeof record.blockHash !== "string" ||
      !isHash(record.blockHash)) {
      throw new Error("Receipt evidence is malformed");
    }
    return {
      label: record.label,
      transactionHash: record.transactionHash,
      blockNumber: BigInt(record.blockNumber),
      blockHash: record.blockHash,
    };
  });
  const labels = ["deploy-registry", "deploy-risk-manager", "deploy-executor", "pause-registry"];
  if (receipts.length !== labels.length || receipts.some((item, index) => item.label !== labels[index])) {
    throw new Error("Receipt evidence sequence is invalid");
  }
  return { commitment: value.commitment, receipts };
}

async function main() {
  const rpcUrl = process.env.XLAYER_TESTNET_RPC_URL;
  if (!rpcUrl) throw new Error("Missing XLAYER_TESTNET_RPC_URL");
  const references = receiptReferences(argument("evidence"));
  const client = createPublicClient({ transport: http(rpcUrl) });
  const first = await client.getTransaction({ hash: references.receipts[0].transactionHash });
  const plan = buildAgentExecutorDeploymentPlanV1({
    chainId: 1952,
    deployer: OPERATOR,
    deployerNonce: BigInt(first.nonce),
    owner: OPERATOR,
    verifier: VERIFIER,
    canaryWallet: CANARY,
    artifacts: executorArtifacts(),
    capabilities: [],
    tokens: [],
  });
  if (keccak256(toBytes(JSON.stringify(plan))) !== references.commitment) {
    throw new Error("Canonical plan commitment mismatch");
  }

  const reader: TestnetDeploymentReader = {
    chainId: () => client.getChainId(),
    transaction: async (hash) => {
      const transaction = await client.getTransaction({ hash });
      return {
        from: transaction.from,
        to: transaction.to,
        input: transaction.input,
        nonce: BigInt(transaction.nonce),
        value: transaction.value,
      };
    },
    receipt: async (hash) => {
      const receipt = await client.getTransactionReceipt({ hash });
      return {
        status: receipt.status,
        contractAddress: receipt.contractAddress ?? null,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
      };
    },
    blockHash: async (blockNumber) => {
      const block = await client.getBlock({ blockNumber });
      if (!block.hash) throw new Error("Canonical block hash is unavailable");
      return block.hash;
    },
    code: async (address) => await client.getCode({ address }) ?? "0x",
    contractValue: async (address, field) => {
      if (getAddress(address) === getAddress(plan.riskManager)) {
        return client.readContract({ address, abi: RISK_ABI, functionName: field } as never);
      }
      if (getAddress(address) === getAddress(plan.executor)) {
        return client.readContract({ address, abi: EXECUTOR_ABI, functionName: field } as never);
      }
      return client.readContract({ address, abi: REGISTRY_ABI, functionName: field } as never);
    },
  };
  const evidence = await verifyTestnetDeployment({
    plan,
    reader,
    receiptEvidence: {
      deployments: references.receipts.slice(0, 3),
      pauseRegistry: references.receipts[3],
    },
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
