import { commitment, type RouteBundleV2 } from "@cobia/domain";
import type { Hash } from "viem";
import { registryHash } from "../adapters/registry";
import type { PurchasedRouteArtifact } from "../db/purchased-route-artifact";
import type {
  ConfirmedOwnerTransactionV2,
  RouteExecutionResultV2,
} from "./engine-types";

export type RehearsalJsonValue =
  | null
  | boolean
  | number
  | string
  | RehearsalJsonValue[]
  | { [key: string]: RehearsalJsonValue };

export interface ExecutionRehearsalTransaction {
  label: ConfirmedOwnerTransactionV2["label"];
  hash: Hash;
  preBlockNumber: string;
  preBlockHash: Hash;
  blockNumber: string;
  blockHash: Hash;
  transactionIndex: number;
  gasEstimate: string;
  protocolEvidence: RehearsalJsonValue;
  stateCheck: RehearsalJsonValue;
}

export interface ExecutionRehearsalTrace {
  version: 1;
  mode: "xlayer-mainnet-fork";
  engineVersion: "execution-v2@1";
  routeId: Hash;
  bundleHash: Hash;
  registryHash: Hash;
  executionChainId: 196;
  buyer: `0x${string}`;
  principalAtomic: string;
  snapshot: {
    blockNumber: string;
    blockHash: Hash;
    capturedAt: string;
  };
  result: {
    status: "success" | "no-action";
    transactions: ExecutionRehearsalTransaction[];
  };
}

type PassingResult = Extract<
  RouteExecutionResultV2,
  { status: "success" | "no-action" }
>;

function jsonValue(value: unknown): RehearsalJsonValue {
  if (value === null || typeof value === "string" ||
    typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonValue);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonValue(item)]));
  }
  throw new Error("Execution trace contains a non-JSON value");
}

function traceTransaction(
  transaction: ConfirmedOwnerTransactionV2,
): ExecutionRehearsalTransaction {
  return {
    label: transaction.label,
    hash: transaction.hash,
    preBlockNumber: transaction.preBlockNumber.toString(),
    preBlockHash: transaction.preBlockHash,
    blockNumber: transaction.blockNumber.toString(),
    blockHash: transaction.blockHash,
    transactionIndex: transaction.transactionIndex,
    gasEstimate: transaction.gasEstimate.toString(),
    protocolEvidence: jsonValue(transaction.protocolEvidence),
    stateCheck: jsonValue(transaction.stateCheck),
  };
}

export function buildExecutionRehearsalTrace(
  artifact: PurchasedRouteArtifact & {
    policy: PurchasedRouteArtifact["policy"] & { version: 2 };
    snapshot: PurchasedRouteArtifact["snapshot"] & { version: 2 };
    bundle: RouteBundleV2;
  },
  result: PassingResult,
): ExecutionRehearsalTrace {
  return {
    version: 1,
    mode: "xlayer-mainnet-fork",
    engineVersion: "execution-v2@1",
    routeId: artifact.id as Hash,
    bundleHash: commitment(artifact.bundle),
    registryHash,
    executionChainId: 196,
    buyer: artifact.policy.owner,
    principalAtomic: artifact.policy.principalAtomic,
    snapshot: {
      blockNumber: artifact.snapshot.blockNumber,
      blockHash: artifact.snapshot.blockHash,
      capturedAt: artifact.snapshot.capturedAt,
    },
    result: {
      status: result.status,
      transactions: result.transactions.map(traceTransaction),
    },
  };
}
