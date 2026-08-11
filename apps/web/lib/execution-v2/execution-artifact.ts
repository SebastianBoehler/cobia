import { commitment, verifyRouteBundleV2 } from "@cobia/domain";
import type { Address, Hash } from "viem";
import { registryHash } from "../adapters/registry";
import { validatePurchasedRouteIntegrity } from "../db/purchased-route-artifact";
import type {
  ExecutionArtifactV2,
  ExecutionServiceDependencies,
  RehearsalRow,
} from "./execution-service-types";

function same(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

function assertPassedRehearsal(
  artifact: Omit<ExecutionArtifactV2, "rehearsal">,
  row: RehearsalRow | undefined,
) {
  const trace = row?.trace;
  const traceRecord = trace && typeof trace === "object"
    ? trace as Record<string, unknown> : undefined;
  const result = traceRecord?.result && typeof traceRecord.result === "object"
    ? traceRecord.result as Record<string, unknown> : undefined;
  const matches = row?.state === "passed"
    && row.executionChainId === 196
    && same(row.routeId, artifact.id)
    && same(row.bundleHash, artifact.id)
    && same(row.buyer, artifact.buyer)
    && typeof row.registryHash === "string" && same(row.registryHash, registryHash)
    && typeof row.snapshotBlockHash === "string"
    && same(row.snapshotBlockHash, artifact.snapshot.blockHash)
    && row.engineVersion === "execution-v2@1"
    && traceRecord
    && typeof row.traceHash === "string" && same(commitment(traceRecord), row.traceHash)
    && traceRecord.version === 1
    && traceRecord.mode === "xlayer-mainnet-fork"
    && traceRecord.executionChainId === 196
    && typeof traceRecord.routeId === "string" && same(traceRecord.routeId, artifact.id)
    && typeof traceRecord.bundleHash === "string" && same(traceRecord.bundleHash, artifact.id)
    && typeof traceRecord.registryHash === "string" && same(traceRecord.registryHash, registryHash)
    && typeof traceRecord.buyer === "string" && same(traceRecord.buyer, artifact.buyer)
    && result?.status === "success";
  if (!matches) throw new Error("Passing execution rehearsal does not match purchased route");
  return row;
}

export async function loadExecutionArtifactV2(
  dependencies: ExecutionServiceDependencies,
  routeId: string,
  buyer: Address,
): Promise<ExecutionArtifactV2> {
  const purchase = await dependencies.purchases.getPurchasedRoute(routeId, buyer);
  if (!purchase) throw new Error("Purchased route is unavailable for mainnet execution");
  const request = await dependencies.requests.getPublicRequest(purchase.requestId);
  if (!request?.snapshot) throw new Error("Purchased route snapshot is unavailable");
  const artifact = validatePurchasedRouteIntegrity({
    purchase,
    policyInput: request.policy,
    snapshotInput: request.snapshot,
    expected: { routeId, buyer, executionChainId: 196 },
  });
  if (artifact.policy.version !== 2 || artifact.snapshot.version !== 2 ||
    artifact.bundle.version !== 2) {
    throw new Error("Mainnet execution requires a purchased V2 route");
  }
  const base: Omit<ExecutionArtifactV2, "rehearsal"> = {
    id: artifact.id.toLowerCase() as Hash,
    buyer: artifact.buyer.toLowerCase() as Address,
    policy: artifact.policy,
    snapshot: artifact.snapshot,
    bundle: artifact.bundle,
  };
  const rehearsal = assertPassedRehearsal(
    base,
    await dependencies.rehearsals.findPassed(base.id, base.id),
  );
  return { ...base, rehearsal };
}

export async function verifyFreshExecutionArtifactV2(
  dependencies: ExecutionServiceDependencies,
  artifact: ExecutionArtifactV2,
  nowSec: number,
) {
  const verdict = await verifyRouteBundleV2(
    artifact.policy,
    artifact.snapshot,
    artifact.bundle,
    dependencies.trustedSolverAddress(artifact.bundle.solverId),
    { expectedAdapterRegistryHash: registryHash },
    nowSec,
  );
  if (!verdict.routeAuthorized) throw new Error("Purchased route is no longer executable");
  return verdict;
}

export async function verifyStoredExecutionArtifactV2(
  dependencies: ExecutionServiceDependencies,
  artifact: ExecutionArtifactV2,
) {
  const capturedAt = Math.floor(Date.parse(artifact.snapshot.capturedAt) / 1_000);
  const verificationTime = Math.min(
    artifact.bundle.validUntil,
    artifact.policy.deadline,
    capturedAt + artifact.policy.maxSnapshotAgeSec,
  ) - 1;
  if (!Number.isSafeInteger(verificationTime) || verificationTime < capturedAt) {
    throw new Error("Stored execution artifact has no valid verification time");
  }
  return verifyFreshExecutionArtifactV2(dependencies, artifact, verificationTime);
}
