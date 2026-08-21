import {
  cobiaMarkets,
  cobiaQuotes,
  cobiaRequests,
  requestState,
} from "./request-schema";
import { cobiaPayments, paymentState } from "./payment-schema";
import {
  cobiaActivityEvents,
  cobiaExecutionRehearsals,
  cobiaRoutePurchases,
  executionRehearsalState,
} from "./route-schema";
import {
  cobiaExecutionAttempts,
  cobiaExecutionSteps,
  executionAttemptState,
  executionStepState,
} from "./execution-schema";
import {
  agentArtifactKind,
  agentProgramState,
  cobiaAgentArtifacts,
  cobiaAgentPrograms,
} from "./agent-program-schema";
import { challengeStatus, cobiaChallengeRounds, cobiaChallenges } from "./challenge-schema";
import { cobiaCommerceOfferSnapshots } from "./commerce-schema";
import {
  cobiaCommercePlacementEvents,
  cobiaCommercePlacements,
  commercePlacementState,
} from "./commerce-placement-schema";
import { cobiaIntents, intentState } from "./intent-schema";
import {
  cobiaProgramArtifactsV2,
  cobiaSolverSubmissions,
  programArtifactKindV2,
  solverSubmissionState,
} from "./program-schema-v2";
import { cobiaSolvers, solverOperatorKind } from "./solver-schema";
import { cobiaSolverRuns, solverRunState } from "./solver-run-schema";
import {
  cobiaOpenIntentSnapshots, cobiaSolverDecisionClaims, cobiaSolverSuccessFees,
  solverSuccessFeeState,
} from "./open-exchange-schema";
import {
  cobiaIntentCompileAttempts, cobiaWalletAuthChallenges, cobiaWalletAuthSessions,
  walletCompileState,
} from "./wallet-auth-schema";

export * from "./execution-schema";
export * from "./payment-schema";
export * from "./request-schema";
export * from "./route-schema";
export * from "./agent-program-schema";
export * from "./challenge-schema";
export * from "./commerce-schema";
export * from "./commerce-placement-schema";
export * from "./intent-schema";
export * from "./program-schema-v2";
export * from "./solver-schema";
export * from "./solver-run-schema";
export * from "./open-exchange-schema";
export * from "./wallet-auth-schema";

export const cobiaSchema = {
  cobiaMarkets,
  cobiaRequests,
  cobiaQuotes,
  cobiaPayments,
  cobiaRoutePurchases,
  cobiaExecutionRehearsals,
  cobiaExecutionAttempts,
  cobiaExecutionSteps,
  cobiaActivityEvents,
  cobiaAgentPrograms,
  cobiaAgentArtifacts,
  cobiaChallenges,
  cobiaChallengeRounds,
  cobiaCommerceOfferSnapshots,
  cobiaCommercePlacements,
  cobiaCommercePlacementEvents,
  cobiaIntents,
  cobiaSolvers,
  cobiaSolverRuns,
  cobiaSolverSubmissions,
  cobiaProgramArtifactsV2,
  cobiaOpenIntentSnapshots,
  cobiaSolverDecisionClaims,
  cobiaSolverSuccessFees,
  cobiaWalletAuthChallenges,
  cobiaWalletAuthSessions,
  cobiaIntentCompileAttempts,
  requestState,
  paymentState,
  executionRehearsalState,
  executionAttemptState,
  executionStepState,
  agentProgramState,
  agentArtifactKind,
  challengeStatus,
  intentState,
  solverOperatorKind,
  solverRunState,
  solverSubmissionState,
  programArtifactKindV2,
  commercePlacementState,
  solverSuccessFeeState,
  walletCompileState,
};

export type CobiaRequestState = (typeof requestState.enumValues)[number];
export type CobiaPaymentState = (typeof paymentState.enumValues)[number];
export type CobiaExecutionRehearsalState =
  (typeof executionRehearsalState.enumValues)[number];
export type CobiaExecutionAttemptState = (typeof executionAttemptState.enumValues)[number];
export type CobiaExecutionStepState = (typeof executionStepState.enumValues)[number];
