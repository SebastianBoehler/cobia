import type {
  DecisionBundle,
  MarketSnapshot,
  RouteBundleV2,
  RouteSnapshotV2,
  StablecoinPolicy,
  StablecoinPolicyV2,
} from "@cobia/domain";
import type { ExecutionRehearsalTrace } from "../../lib/execution-v2/rehearsal-trace";

interface PurchasedRouteBase {
  id: string;
  requestId: string;
  quoteId: string;
  buyer: string;
  executionChainId: number;
  paymentChainId: number | null;
  receiptHash: string;
  purchasedAt: string;
}

export interface PurchasedRouteV1 extends PurchasedRouteBase {
  policy: StablecoinPolicy;
  snapshot: MarketSnapshot;
  bundle: DecisionBundle;
}

export interface PurchasedRouteV2 extends PurchasedRouteBase {
  policy: StablecoinPolicyV2;
  snapshot: RouteSnapshotV2;
  bundle: RouteBundleV2;
  rehearsalRealm: string;
  rehearsal: {
    id: string;
    state: "passed";
    trace: ExecutionRehearsalTrace;
  } | null;
}

export type PurchasedRoute = PurchasedRouteV1 | PurchasedRouteV2;
