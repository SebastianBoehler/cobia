import {
  RouteBundleV2Schema,
  RoutePlanV2Schema,
  StablecoinPolicyV2Schema,
  commitment,
  estimateRouteEconomicsV2,
  verifyRouteBundleV2,
  type RouteSnapshotV2,
} from "@cobia/domain";
import { signRouteBundleV2 } from "@cobia/solvers";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import {
  createPublicClient,
  encodeFunctionData,
  getAddress,
  http,
  isHash,
  keccak256,
  toHex,
  type Address,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROTOCOL_REGISTRY, registryHash } from "../adapters/registry";
import { xLayer } from "../chain/xlayer";
import { buildRoutePolicyV2 } from "../intents/route-policy-v2";
import { captureRouteSnapshotV2 } from "../orchestrator/capture-route-snapshot-v2";
import { routeSnapshotDependencies } from "../orchestrator/route-snapshot-client";
import { executeRoutePlanV2 } from "./execute-route";
import { createExecutionReadClientV2 } from "./viem-client";

const ANVIL_IMAGE = "ghcr.io/foundry-rs/foundry:stable@sha256:043752653d5be351c71709091b3db97c4421c907eb40ea294195e7f532aadf46";
const FORK_BLOCK = 67_649_362;
const FORK_RPC = "https://rpc.xlayer.tech";
const PRINCIPAL = 25_000_000_000n;
const TRANSFER_ABI = [{
  type: "function",
  name: "transfer",
  stateMutability: "nonpayable",
  inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ name: "", type: "bool" }],
}] as const;

let container: StartedTestContainer | undefined;
let rpcUrl = "";
let rpcId = 0;

async function rpc(method: string, params: readonly unknown[] = []): Promise<unknown> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const body = await response.json() as {
    result?: unknown;
    error?: { message?: string };
  };
  if (!response.ok || body.error) {
    throw new Error(body.error?.message ?? `Fork RPC ${method} failed`);
  }
  return body.result;
}

function rpcHash(value: unknown): Hash {
  if (typeof value !== "string" || !isHash(value)) {
    throw new Error("Fork RPC returned a malformed transaction hash");
  }
  return value;
}

function rpcOwner(value: unknown): Address {
  if (!Array.isArray(value) || typeof value[0] !== "string") {
    throw new Error("Fork RPC returned no unlocked owner account");
  }
  return getAddress(value[0]);
}

function swapPlan(policy: ReturnType<typeof StablecoinPolicyV2Schema.parse>, snapshot: RouteSnapshotV2) {
  const deployed = BigInt(policy.principalAtomic) * BigInt(policy.protocolExposureBps) / 10_000n;
  const swap = snapshot.opportunities.find((item) =>
    item.kind === "uniswap-v3-exact-input" &&
    item.tokenIn.toLowerCase() === policy.asset.toLowerCase());
  if (!swap || swap.kind !== "uniswap-v3-exact-input") {
    throw new Error("Pinned fork snapshot has no registered swap opportunity");
  }
  const supply = snapshot.opportunities.find((item) =>
    item.kind === "aave-v3-supply" &&
    item.asset.toLowerCase() === swap.tokenOut.toLowerCase() &&
    item.validatedSupplyAtomic === swap.quotedOutputAtomic);
  if (!supply || supply.kind !== "aave-v3-supply") {
    throw new Error("Pinned fork snapshot has no amount-bound output supply opportunity");
  }
  const minimumOutput = (
    BigInt(swap.quotedOutputAtomic) * BigInt(10_000 - policy.maxSlippageBps) + 9_999n
  ) / 10_000n;
  return RoutePlanV2Schema.parse({
    version: 2,
    inputAsset: policy.asset,
    inputAtomic: policy.principalAtomic,
    retainedAtomic: (BigInt(policy.principalAtomic) - deployed).toString(),
    horizonDays: policy.horizonDays,
    legs: [{
      id: "fork-swap-then-supply",
      inputAtomic: deployed.toString(),
      actions: [{
        kind: "uniswap-v3-exact-input",
        opportunityId: swap.id,
        consume: "all",
        tokenIn: swap.tokenIn,
        tokenOut: swap.tokenOut,
        quotedOutputAtomic: swap.quotedOutputAtomic,
        minimumOutputAtomic: minimumOutput.toString(),
      }, {
        kind: "aave-v3-supply",
        opportunityId: supply.id,
        consume: "all",
        asset: supply.asset,
      }],
    }],
  });
}

beforeAll(async () => {
  container = await new GenericContainer(ANVIL_IMAGE)
    .withCommand([`anvil --host 0.0.0.0 --fork-url ${FORK_RPC} --fork-block-number ${FORK_BLOCK} --chain-id 196 --silent`])
    .withExposedPorts(8545)
    .withStartupTimeout(180_000)
    .start();
  rpcUrl = `http://${container.getHost()}:${container.getMappedPort(8545)}`;
});

afterAll(async () => {
  await container?.stop();
});

describe("V2 X Layer mainnet-fork execution", () => {
  it("captures, authorizes, swaps USDG, and supplies the quoted USDt0 amount", async () => {
    const publicClient = createPublicClient({
      cacheTime: 0,
      chain: xLayer,
      transport: http(rpcUrl),
    });
    const owner = rpcOwner(await rpc("eth_accounts"));
    const source = PROTOCOL_REGISTRY.aaveV3.assets.USDG.aToken.address;
    const inputAsset = PROTOCOL_REGISTRY.aaveV3.assets.USDG.underlying.address;
    await rpc("anvil_impersonateAccount", [source]);
    await rpc("anvil_setBalance", [source, "0x56bc75e2d63100000"]);
    const fundingHash = rpcHash(await rpc("eth_sendTransaction", [{
      from: source,
      to: inputAsset,
      data: encodeFunctionData({
        abi: TRANSFER_ABI,
        functionName: "transfer",
        args: [owner, PRINCIPAL],
      }),
      value: "0x0",
    }]));
    await publicClient.waitForTransactionReceipt({ hash: fundingHash });
    await rpc("anvil_stopImpersonatingAccount", [source]);

    const capturedBlock = await publicClient.getBlock({ blockTag: "latest" });
    const basePolicy = buildRoutePolicyV2({
      requestId: "550e8400-e29b-41d4-a716-446655440099",
      owner,
      asset: inputAsset,
      principalAtomic: PRINCIPAL.toString(),
      protocolExposureBps: 4_000,
      minTvlUsdE6: "1000000",
      minPreGasApyBps: 1,
      nowSec: Number(capturedBlock.timestamp),
    });
    const policy = StablecoinPolicyV2Schema.parse({ ...basePolicy, horizonDays: 365 });
    const snapshot = await captureRouteSnapshotV2(
      policy,
      routeSnapshotDependencies(publicClient),
    );
    const plan = swapPlan(policy, snapshot);
    const economics = estimateRouteEconomicsV2(policy, snapshot, plan);
    expect(economics.positiveGain).toBe(true);

    const solver = privateKeyToAccount(keccak256(toHex("cobia-fork-route-solver")));
    const validUntil = Math.min(
      policy.deadline,
      Math.floor(Date.parse(snapshot.capturedAt) / 1_000) + policy.maxSnapshotAgeSec,
    );
    const unsigned = RouteBundleV2Schema.omit({ signature: true }).parse({
      version: 2,
      requestId: policy.requestId,
      solverId: "fork-route-solver",
      solverAddress: solver.address,
      policyHash: commitment(policy),
      snapshotHash: commitment(snapshot),
      routePlan: plan,
      evidence: [],
      riskFlags: [],
      estimatedPreGasApyBps: economics.estimatedPreGasApyBps,
      validUntil,
    });
    const bundle = await signRouteBundleV2(unsigned, solver);
    const nowSec = Number((await publicClient.getBlock({ blockTag: "latest" })).timestamp);
    const verdict = await verifyRouteBundleV2(
      policy,
      snapshot,
      bundle,
      solver.address,
      { expectedAdapterRegistryHash: registryHash },
      nowSec,
    );
    expect(verdict.routeAuthorized, verdict.errorCodes.join(", ")).toBe(true);

    const result = await executeRoutePlanV2({
      policy,
      bundle,
      verdict,
      nowSec: () => nowSec,
      wallet: { request: ({ method, params }) => rpc(method, params) },
      readClient: createExecutionReadClientV2(publicClient),
      waitForReceiptPoll: async () => { await rpc("anvil_mine", [1]); },
    });

    const diagnostic = "failure" in result
      ? `${result.failure.code}: ${result.failure.message}`
      : "submitted" in result
        ? `${result.status}: ${result.submitted.label}; confirmed=${result.transactions.map(({ label }) => label).join(",")}`
        : result.status;
    expect(result.status, diagnostic).toBe("success");
    expect(result.transactions.map(({ label }) => label)).toEqual([
      "approve-uniswap-exact",
      "uniswap-v3-exact-input",
      "approve-aave-exact",
      "aave-v3-supply",
    ]);
    expect(result.transactions.at(-1)?.stateCheck).toMatchObject({
      kind: "aave-supply",
      suppliedAtomic: BigInt(
        plan.legs[0]!.actions[0]!.kind === "uniswap-v3-exact-input"
          ? plan.legs[0]!.actions[0]!.quotedOutputAtomic
          : "0",
      ),
    });
  });
});
