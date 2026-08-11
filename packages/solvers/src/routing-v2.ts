import {
  RouteBundleV2Schema,
  RouteSnapshotV2Schema,
  StablecoinPolicyV2Schema,
  assessRouteAuthorizationV2,
  commitment,
  type RoutePlanV2,
  type RouteSnapshotV2,
  type StablecoinPolicyV2,
} from "@cobia/domain";
import {
  type Address,
  type Hash,
  type LocalAccount,
} from "viem";
import { signRouteBundleV2 } from "./sign";
import {
  noActionCandidateV2,
  routeCandidatesV2,
  type RouteCandidateV2,
} from "./routing-v2-candidates";

const UnsignedRouteBundleV2Schema = RouteBundleV2Schema.omit({ signature: true });

export interface RouteSolverInputV2 {
  policy: StablecoinPolicyV2;
  snapshot: RouteSnapshotV2;
  nowSec: number;
}
export interface RouteBuilderOptionsV2 {
  solverId: string;
  solverAddress: Address;
  expectedAdapterRegistryHash: Hash;
}
export type UnsignedRouteBundleV2 = Omit<
  ReturnType<typeof RouteBundleV2Schema.parse>,
  "signature"
>;
export interface DeterministicRouteSolverOptionsV2 {
  solverId: string;
  account: LocalAccount;
  expectedAdapterRegistryHash: Hash;
}
export interface RouteSolverV2 {
  id: string;
  address: Address;
  solve(input: RouteSolverInputV2): Promise<ReturnType<typeof RouteBundleV2Schema.parse>>;
}

export interface RouteCandidateSummaryV2 {
  id: string;
  estimatedPreGasApyBps: number;
  retainedAtomic: string;
  deployedAtomic: string;
  actions: readonly RoutePlanV2["legs"][number]["actions"][number]["kind"][];
}

function validUntil(input: RouteSolverInputV2): number {
  const capturedAtSec = Math.floor(Date.parse(input.snapshot.capturedAt) / 1_000);
  return Math.min(
    input.policy.deadline,
    capturedAtSec + input.policy.maxSnapshotAgeSec,
  );
}

function parseRouteInput(rawInput: RouteSolverInputV2) {
  const policy = StablecoinPolicyV2Schema.parse(rawInput.policy);
  const snapshot = RouteSnapshotV2Schema.parse(rawInput.snapshot);
  const input = { ...rawInput, policy, snapshot };
  if (snapshot.requestId !== policy.requestId) {
    throw new Error("Policy and snapshot request IDs do not match");
  }
  if (Date.parse(snapshot.capturedAt) > rawInput.nowSec * 1_000) {
    throw new Error("Routing snapshot is from the future");
  }
  const expiry = validUntil(input);
  if (expiry <= rawInput.nowSec) throw new Error("Routing snapshot is expired");
  return { input, policy, snapshot, expiry };
}

function buildRouteBundleForCandidateV2(
  rawInput: RouteSolverInputV2,
  options: RouteBuilderOptionsV2,
  candidate: RouteCandidateV2,
): UnsignedRouteBundleV2 {
  const { policy, snapshot, expiry } = parseRouteInput(rawInput);
  const bundle = UnsignedRouteBundleV2Schema.parse({
    version: 2,
    requestId: policy.requestId,
    solverId: options.solverId,
    solverAddress: options.solverAddress,
    policyHash: commitment(policy),
    snapshotHash: commitment(snapshot),
    routePlan: candidate.plan,
    evidence: [],
    riskFlags: [],
    estimatedPreGasApyBps: candidate.economics.estimatedPreGasApyBps,
    validUntil: expiry,
  });
  const authorization = assessRouteAuthorizationV2(policy, snapshot, bundle, {
    expectedAdapterRegistryHash: options.expectedAdapterRegistryHash,
  });
  if (!authorization.authorizationValid) {
    throw new Error(
      `Generated route is not authorized: ${authorization.errorCodes.join(",").toLowerCase()}`,
    );
  }
  return bundle;
}

export function listRouteCandidateSummariesV2(
  rawInput: RouteSolverInputV2,
): readonly RouteCandidateSummaryV2[] {
  const { policy, snapshot } = parseRouteInput(rawInput);
  return Object.freeze(routeCandidatesV2(policy, snapshot).map(({ id, economics, plan }) =>
    Object.freeze({
      id,
      estimatedPreGasApyBps: economics.estimatedPreGasApyBps,
      retainedAtomic: plan.retainedAtomic,
      deployedAtomic: plan.legs[0]!.inputAtomic,
      actions: Object.freeze(plan.legs[0]!.actions.map(({ kind }) => kind)),
    })
  ));
}

export function buildSelectedRouteBundleV2(
  rawInput: RouteSolverInputV2,
  options: RouteBuilderOptionsV2,
  candidateId: string,
): UnsignedRouteBundleV2 {
  const { policy, snapshot } = parseRouteInput(rawInput);
  const candidate = routeCandidatesV2(policy, snapshot).find(({ id }) => id === candidateId);
  if (!candidate) throw new Error("Advisor selected an unknown route candidate");
  return buildRouteBundleForCandidateV2(rawInput, options, candidate);
}

export function buildDeterministicRouteBundleV2(
  rawInput: RouteSolverInputV2,
  options: RouteBuilderOptionsV2,
): UnsignedRouteBundleV2 {
  const { policy, snapshot } = parseRouteInput(rawInput);
  const candidate = routeCandidatesV2(policy, snapshot)[0] ?? noActionCandidateV2(policy);
  return buildRouteBundleForCandidateV2(rawInput, options, candidate);
}

export function createDeterministicRouteSolverV2(
  options: DeterministicRouteSolverOptionsV2,
): RouteSolverV2 {
  return {
    id: options.solverId,
    address: options.account.address,
    solve: (input) => signRouteBundleV2(
      buildDeterministicRouteBundleV2(input, {
        solverId: options.solverId,
        solverAddress: options.account.address,
        expectedAdapterRegistryHash: options.expectedAdapterRegistryHash,
      }),
      options.account,
    ),
  };
}
