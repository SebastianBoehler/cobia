import {
  RouteBundleV2Schema,
  RouteSnapshotV2Schema,
  StablecoinPolicyV2Schema,
  commitment,
  type RouteBundleV2,
  type RouteSnapshotV2,
  type StablecoinPolicyV2,
} from "@cobia/domain";
import { GenericContainer } from "testcontainers";
import { isAddress, isAddressEqual } from "viem";
import type { PurchasedRouteArtifact } from "../db/purchased-route-artifact";
import type { RouteExecutionResultV2 } from "./engine-types";
import { executePurchasedRouteOnFork } from "./rehearsal-fork-executor";
import {
  buildExecutionRehearsalTrace,
  type ExecutionRehearsalTrace,
} from "./rehearsal-trace";

const ANVIL_IMAGE = "ghcr.io/foundry-rs/foundry:stable@sha256:043752653d5be351c71709091b3db97c4421c907eb40ea294195e7f532aadf46";
const XLAYER_RPC = "https://rpc.xlayer.tech";
const DEFAULT_TIMEOUT_MS = 210_000;

export interface PurchasedRouteArtifactV2 extends Omit<
  PurchasedRouteArtifact,
  "policy" | "snapshot" | "bundle"
> {
  policy: StablecoinPolicyV2;
  snapshot: RouteSnapshotV2;
  bundle: RouteBundleV2;
}

export interface RehearsalRuntime {
  start(input: { blockNumber: bigint }): Promise<{
    rpcUrl: string;
    stop(): Promise<void>;
  }>;
}

export interface ForkExecutionOutput {
  snapshotBlockHash: `0x${string}`;
  fundedPrincipalAtomic: string;
  result: RouteExecutionResultV2;
}

export interface RehearsalDependencies {
  runtime?: RehearsalRuntime;
  executeOnFork?: (
    artifact: PurchasedRouteArtifactV2,
    rpcUrl: string,
  ) => Promise<ForkExecutionOutput>;
  timeoutMs?: number;
}

export const testcontainersRehearsalRuntime: RehearsalRuntime = {
  async start({ blockNumber }) {
    const container = await new GenericContainer(ANVIL_IMAGE)
      .withCommand([
        `anvil --host 0.0.0.0 --fork-url ${XLAYER_RPC} ` +
        `--fork-block-number ${blockNumber} --chain-id 196 --silent`,
      ])
      .withExposedPorts(8545)
      .withStartupTimeout(180_000)
      .start();
    return {
      rpcUrl: `http://${container.getHost()}:${container.getMappedPort(8545)}`,
      stop: async () => { await container.stop(); },
    };
  },
};

function parseV2Artifact(artifact: PurchasedRouteArtifact): PurchasedRouteArtifactV2 {
  if (artifact.policy.version !== 2 || artifact.snapshot.version !== 2 ||
    artifact.bundle.version !== 2) {
    throw new Error("Fork rehearsal supports purchased V2 routes only");
  }
  const policy = StablecoinPolicyV2Schema.parse(artifact.policy);
  const snapshot = RouteSnapshotV2Schema.parse(artifact.snapshot);
  const bundle = RouteBundleV2Schema.parse(artifact.bundle);
  const bundleHash = commitment(bundle);
  const matches = artifact.executionChainId === 196
    && policy.executionChainId === 196
    && snapshot.chainId === 196
    && artifact.requestId === policy.requestId
    && artifact.requestId === snapshot.requestId
    && artifact.requestId === bundle.requestId
    && artifact.id.toLowerCase() === bundleHash.toLowerCase()
    && artifact.quoteId.toLowerCase() === bundleHash.toLowerCase()
    && bundle.policyHash.toLowerCase() === commitment(policy).toLowerCase()
    && bundle.snapshotHash.toLowerCase() === commitment(snapshot).toLowerCase()
    && isAddress(artifact.buyer)
    && isAddressEqual(policy.owner, artifact.buyer);
  if (!matches) throw new Error("Purchased V2 route integrity check failed");
  return { ...artifact, policy, snapshot, bundle };
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Fork rehearsal timed out")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function runPurchasedRouteRehearsal(
  rawArtifact: PurchasedRouteArtifact,
  dependencies: RehearsalDependencies = {},
): Promise<ExecutionRehearsalTrace> {
  const artifact = parseV2Artifact(rawArtifact);
  const runtime = dependencies.runtime ?? testcontainersRehearsalRuntime;
  const executeOnFork = dependencies.executeOnFork ?? executePurchasedRouteOnFork;
  const instance = await runtime.start({
    blockNumber: BigInt(artifact.snapshot.blockNumber),
  });
  try {
    const output = await withTimeout(
      executeOnFork(artifact, instance.rpcUrl),
      dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    if (output.snapshotBlockHash.toLowerCase() !== artifact.snapshot.blockHash.toLowerCase()) {
      throw new Error("Fork snapshot block hash does not match the purchased route");
    }
    if (output.fundedPrincipalAtomic !== artifact.policy.principalAtomic) {
      throw new Error("Fork funded principal does not match the purchased route");
    }
    if (output.result.status !== "success" && output.result.status !== "no-action") {
      throw new Error(`Fork execution did not complete: ${output.result.status}`);
    }
    return buildExecutionRehearsalTrace(artifact, output.result);
  } finally {
    await instance.stop();
  }
}
