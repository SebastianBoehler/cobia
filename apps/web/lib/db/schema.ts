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
import { cobiaIntents, intentState } from "./intent-schema";
import {
  cobiaProgramArtifactsV2,
  cobiaSolverSubmissions,
  programArtifactKindV2,
  solverSubmissionState,
} from "./program-schema-v2";
import { cobiaSolvers, solverOperatorKind } from "./solver-schema";

export * from "./execution-schema";
export * from "./payment-schema";
export * from "./request-schema";
export * from "./route-schema";
export * from "./agent-program-schema";
export * from "./challenge-schema";
export * from "./intent-schema";
export * from "./program-schema-v2";
export * from "./solver-schema";

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
  cobiaIntents,
  cobiaSolvers,
  cobiaSolverSubmissions,
  cobiaProgramArtifactsV2,
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
  solverSubmissionState,
  programArtifactKindV2,
};

export type CobiaRequestState = (typeof requestState.enumValues)[number];
export type CobiaPaymentState = (typeof paymentState.enumValues)[number];
export type CobiaExecutionRehearsalState =
  (typeof executionRehearsalState.enumValues)[number];
export type CobiaExecutionAttemptState = (typeof executionAttemptState.enumValues)[number];
export type CobiaExecutionStepState = (typeof executionStepState.enumValues)[number];
