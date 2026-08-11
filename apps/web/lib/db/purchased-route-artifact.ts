import {
  PersistedBundleSchema,
  PersistedSnapshotSchema,
  PersistedStablecoinPolicySchema,
  commitment,
  type PersistedBundle,
  type PersistedSnapshot,
  type PersistedStablecoinPolicy,
} from "@cobia/domain";
import { isAddress, isAddressEqual } from "viem";

const HASH = /^0x[0-9a-fA-F]{64}$/;

export interface PurchasedRouteRecord {
  id: string;
  requestId: string;
  quoteId: string;
  buyer: string;
  executionChainId: number;
  paymentChainId: number | null;
  paymentId: string | null;
  receiptHash: string;
  bundle: unknown;
  purchasedAt: Date;
}

export interface PurchasedRouteExpectation {
  routeId: string;
  buyer: string;
  requestId?: string;
  executionChainId?: number;
  paymentChainId?: number | null;
  paymentId?: string;
  receiptHash?: string;
  purchasedAt?: Date;
}

export interface PurchasedRouteArtifact {
  id: string;
  requestId: string;
  quoteId: string;
  buyer: string;
  executionChainId: number;
  paymentChainId: number | null;
  receiptHash: string;
  purchasedAt: Date;
  bundle: PersistedBundle;
  policy: PersistedStablecoinPolicy;
  snapshot: PersistedSnapshot;
}

function sameHash(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

export function validatePurchasedRouteIntegrity(input: {
  purchase: PurchasedRouteRecord;
  policyInput: unknown;
  snapshotInput: unknown;
  expected: PurchasedRouteExpectation;
}): PurchasedRouteArtifact {
  const { purchase, expected } = input;
  const bundle = PersistedBundleSchema.parse(purchase.bundle);
  const policy = PersistedStablecoinPolicySchema.parse(input.policyInput);
  const snapshot = PersistedSnapshotSchema.parse(input.snapshotInput);
  const purchasedAt = purchase.purchasedAt;
  const expectedDate = expected.purchasedAt;
  const matches = HASH.test(purchase.id)
    && HASH.test(purchase.quoteId)
    && HASH.test(purchase.receiptHash)
    && HASH.test(expected.routeId)
    && sameHash(purchase.id, expected.routeId)
    && sameHash(purchase.quoteId, expected.routeId)
    && purchase.requestId === bundle.requestId
    && (expected.requestId === undefined || purchase.requestId === expected.requestId)
    && isAddress(purchase.buyer)
    && isAddress(expected.buyer)
    && isAddressEqual(purchase.buyer, expected.buyer)
    && sameHash(commitment(bundle), expected.routeId)
    && purchasedAt instanceof Date
    && Number.isFinite(purchasedAt.getTime())
    && (expectedDate === undefined || purchasedAt.getTime() === expectedDate.getTime())
    && (expected.executionChainId === undefined
      || purchase.executionChainId === expected.executionChainId)
    && (expected.paymentChainId === undefined
      || purchase.paymentChainId === expected.paymentChainId)
    && (expected.paymentId === undefined || purchase.paymentId === expected.paymentId)
    && (expected.receiptHash === undefined
      || sameHash(purchase.receiptHash, expected.receiptHash))
    && policy.version === snapshot.version
    && policy.version === bundle.version
    && policy.requestId === purchase.requestId
    && snapshot.requestId === purchase.requestId
    && snapshot.chainId === purchase.executionChainId
    && policy.executionChainId === purchase.executionChainId
    && isAddressEqual(policy.owner, purchase.buyer)
    && sameHash(commitment(policy), bundle.policyHash)
    && sameHash(commitment(snapshot), bundle.snapshotHash);
  if (!matches) throw new Error("Purchased route integrity check failed");

  return {
    id: purchase.id,
    requestId: purchase.requestId,
    quoteId: purchase.quoteId,
    buyer: purchase.buyer,
    executionChainId: purchase.executionChainId,
    paymentChainId: purchase.paymentChainId,
    receiptHash: purchase.receiptHash,
    purchasedAt,
    bundle,
    policy,
    snapshot,
  };
}
