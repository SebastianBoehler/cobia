import { verifyRouteBundleV2 } from "@cobia/domain";
import {
  createPublicClient,
  encodeFunctionData,
  http,
  isHash,
  type Hash,
} from "viem";
import { registryHash } from "../adapters/registry";
import { xLayer } from "../chain/xlayer";
import type {
  ForkExecutionOutput,
  PurchasedRouteArtifactV2,
} from "./anvil-rehearsal";
import { executeRoutePlanV2 } from "./execute-route";
import { registeredExecutionAsset } from "./execution-context";
import { createExecutionReadClientV2 } from "./viem-client";

const TRANSFER_ABI = [{
  type: "function",
  name: "transfer",
  stateMutability: "nonpayable",
  inputs: [
    { name: "to", type: "address" },
    { name: "amount", type: "uint256" },
  ],
  outputs: [{ name: "", type: "bool" }],
}] as const;
const FORK_GAS_BALANCE = "0x56bc75e2d63100000";

interface RpcBody {
  result?: unknown;
  error?: { message?: string };
}

function createRpc(rpcUrl: string) {
  let id = 0;
  return async (method: string, params: readonly unknown[] = []): Promise<unknown> => {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    });
    const body = await response.json() as RpcBody;
    if (!response.ok || body.error) {
      throw new Error(body.error?.message ?? `Fork RPC ${method} failed`);
    }
    return body.result;
  };
}

function transactionHash(value: unknown): Hash {
  if (typeof value !== "string" || !isHash(value)) {
    throw new Error("Fork RPC returned a malformed transaction hash");
  }
  return value;
}

async function fundOwner(input: {
  artifact: PurchasedRouteArtifactV2;
  rpc: ReturnType<typeof createRpc>;
  waitForReceipt(hash: Hash): Promise<unknown>;
}): Promise<void> {
  const { artifact, rpc } = input;
  const principal = BigInt(artifact.policy.principalAtomic);
  const asset = registeredExecutionAsset(artifact.policy.asset);
  await rpc("anvil_impersonateAccount", [asset.aToken]);
  try {
    await rpc("anvil_setBalance", [asset.aToken, FORK_GAS_BALANCE]);
    const hash = transactionHash(await rpc("eth_sendTransaction", [{
      from: asset.aToken,
      to: asset.address,
      data: encodeFunctionData({
        abi: TRANSFER_ABI,
        functionName: "transfer",
        args: [artifact.policy.owner, principal],
      }),
      value: "0x0",
    }]));
    await input.waitForReceipt(hash);
  } finally {
    await rpc("anvil_stopImpersonatingAccount", [asset.aToken]);
  }
}

export async function executePurchasedRouteOnFork(
  artifact: PurchasedRouteArtifactV2,
  rpcUrl: string,
): Promise<ForkExecutionOutput> {
  const rpc = createRpc(rpcUrl);
  const client = createPublicClient({
    cacheTime: 0,
    chain: xLayer,
    transport: http(rpcUrl),
  });
  const blockNumber = BigInt(artifact.snapshot.blockNumber);
  const forkBlock = await client.getBlock({ blockNumber });
  if (!forkBlock.hash) throw new Error("Fork snapshot block has no hash");
  if (forkBlock.hash.toLowerCase() !== artifact.snapshot.blockHash.toLowerCase()) {
    throw new Error("Fork snapshot block hash does not match the purchased route");
  }

  const historicalNowSec = Math.ceil(Date.parse(artifact.snapshot.capturedAt) / 1_000);
  const verdict = await verifyRouteBundleV2(
    artifact.policy,
    artifact.snapshot,
    artifact.bundle,
    artifact.bundle.solverAddress,
    { expectedAdapterRegistryHash: registryHash },
    historicalNowSec,
  );
  if (!verdict.routeAuthorized) {
    throw new Error(`Purchased route authorization failed: ${verdict.errorCodes.join(",")}`);
  }

  await fundOwner({
    artifact,
    rpc,
    waitForReceipt: (hash) => client.waitForTransactionReceipt({ hash }),
  });
  await rpc("anvil_setBalance", [artifact.policy.owner, FORK_GAS_BALANCE]);
  await rpc("anvil_impersonateAccount", [artifact.policy.owner]);
  try {
    const walletRequest = (method: string, params?: readonly unknown[]) => {
      if (method === "eth_accounts" || method === "eth_requestAccounts") {
        return Promise.resolve([artifact.policy.owner]);
      }
      return rpc(method, params);
    };
    const result = await executeRoutePlanV2({
      policy: artifact.policy,
      bundle: artifact.bundle,
      verdict,
      nowSec: () => historicalNowSec,
      wallet: { request: ({ method, params }) => walletRequest(method, params) },
      readClient: createExecutionReadClientV2(client),
      waitForReceiptPoll: async () => { await rpc("anvil_mine", [1]); },
    });
    return {
      snapshotBlockHash: forkBlock.hash,
      fundedPrincipalAtomic: artifact.policy.principalAtomic,
      result,
    };
  } finally {
    await rpc("anvil_stopImpersonatingAccount", [artifact.policy.owner]);
  }
}
