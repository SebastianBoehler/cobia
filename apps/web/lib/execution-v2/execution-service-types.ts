import type {
  PersistedBundle,
  PersistedSnapshot,
  PersistedStablecoinPolicy,
  RouteBundleV2,
  RouteSnapshotV2,
  StablecoinPolicyV2,
} from "@cobia/domain";
import type { Address, Hash } from "viem";
import type {
  BeginExecutionInput,
  ConfirmExecutionStepInput,
  PrepareExecutionStepInput,
} from "../db/execution-records";
import {
  cobiaExecutionAttempts,
  cobiaExecutionRehearsals,
  cobiaExecutionSteps,
  cobiaRoutePurchases,
} from "../db/schema";
import type { ExecutionReadClientV2 } from "./engine-types";
import type { ReceiptPollWaitV2 } from "./receipt-validation";

export type AttemptRow = typeof cobiaExecutionAttempts.$inferSelect;
export type StepRow = typeof cobiaExecutionSteps.$inferSelect;
export type RehearsalRow = typeof cobiaExecutionRehearsals.$inferSelect;
export type ExecutionAttempt = AttemptRow & { steps: StepRow[] };
export type PurchaseRow = typeof cobiaRoutePurchases.$inferSelect & {
  bundle: PersistedBundle;
};

export interface PublicRouteRequest {
  policy: PersistedStablecoinPolicy;
  snapshot: PersistedSnapshot | null;
}

export interface ExecutionArtifactV2 {
  id: Hash;
  buyer: Address;
  policy: StablecoinPolicyV2;
  snapshot: RouteSnapshotV2;
  bundle: RouteBundleV2;
  rehearsal: RehearsalRow;
}

export interface ExecutionServiceDependencies {
  purchases: {
    getPurchasedRoute(routeId: string, buyer: string): Promise<PurchaseRow | undefined>;
  };
  requests: {
    getPublicRequest(requestId: string): Promise<PublicRouteRequest | undefined>;
  };
  rehearsals: {
    findPassed(routeId: string, bundleHash: string): PromiseLike<RehearsalRow | undefined>;
  };
  executions: {
    begin(input: BeginExecutionInput): Promise<AttemptRow>;
    prepareStep(input: PrepareExecutionStepInput): Promise<StepRow>;
    armStep(attemptId: string, ordinal: number): Promise<StepRow>;
    cancelArmedStep(attemptId: string, ordinal: number): Promise<StepRow>;
    getAttempt(attemptId: string): Promise<ExecutionAttempt | null>;
    getByRoute(routeId: string): Promise<ExecutionAttempt | null>;
    bindSubmittedHash(attemptId: string, ordinal: number, hash: Hash): Promise<StepRow>;
    confirmStep(
      attemptId: string,
      ordinal: number,
      input: ConfirmExecutionStepInput,
    ): Promise<unknown>;
    markReconcile(attemptId: string, ordinal: number, code: string): Promise<unknown>;
  };
  readClient: ExecutionReadClientV2;
  realm: string;
  sessionSecret: string;
  trustedSolverAddress(solverId: string): Address;
  nowSec(): number;
  waitForReceiptPoll?: ReceiptPollWaitV2;
}
