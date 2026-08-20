import type { GeneralIntentPolicyV2, OpenIntentPolicyV3 } from "@cobia/domain";
import { createDatabase } from "../db/client";
import { createActivityRepository } from "../db/activity";
import { createIntentRepository } from "../db/intents";
import { createChallengeRepository } from "../db/challenges";
import { createCommerceOfferRepository } from "../db/commerce-offers";
import { createCommercePlacementRepository } from "../db/commerce-placements";
import { createSolverProfileRepository } from "../db/solver-profiles";
import { createSolverRunRepository } from "../db/solver-runs";
import { createSolverSubmissionRepository } from "../db/solver-submissions";
import { readDatabaseUrl } from "../env";
import { openGeneralCodingAgentCompetition } from "./general-coding-agent";
import { cobiaCodingAgentProfile } from "./solver-catalog";
import { productionCapabilityManifestV1 } from "../capabilities/manifest";
import {
  ActiveManifestMismatchError,
  assertPolicyTargetsActiveManifest,
} from "./active-capabilities";

let activityRepository: ReturnType<typeof createActivityRepository> | undefined;
let database: ReturnType<typeof createDatabase> | undefined;
let intentRepository: ReturnType<typeof createIntentRepository> | undefined;
let challengeRepository: ReturnType<typeof createChallengeRepository> | undefined;
let commerceOfferRepository: ReturnType<typeof createCommerceOfferRepository> | undefined;
let commercePlacementRepository: ReturnType<typeof createCommercePlacementRepository> | undefined;
let solverProfileRepository: ReturnType<typeof createSolverProfileRepository> | undefined;
let solverRunRepository: ReturnType<typeof createSolverRunRepository> | undefined;
let solverSubmissionRepository: ReturnType<typeof createSolverSubmissionRepository> | undefined;

function getDatabase() {
  database ??= createDatabase(readDatabaseUrl());
  return database.db;
}

export function getActivityRepository() {
  activityRepository ??= createActivityRepository(getDatabase());
  return activityRepository;
}

export function getIntentRepository() {
  intentRepository ??= createIntentRepository(getDatabase());
  return intentRepository;
}

export function getChallengeRepository() {
  challengeRepository ??= createChallengeRepository(getDatabase());
  return challengeRepository;
}

export function getCommerceOfferRepository() {
  commerceOfferRepository ??= createCommerceOfferRepository(getDatabase());
  return commerceOfferRepository;
}

export function getCommercePlacementRepository() {
  commercePlacementRepository ??= createCommercePlacementRepository(getDatabase());
  return commercePlacementRepository;
}

export function getSolverProfileRepository() {
  solverProfileRepository ??= createSolverProfileRepository(getDatabase());
  return solverProfileRepository;
}

export function getSolverRunRepository() {
  solverRunRepository ??= createSolverRunRepository(getDatabase());
  return solverRunRepository;
}

export function getSolverSubmissionRepository() {
  solverSubmissionRepository ??= createSolverSubmissionRepository(getDatabase());
  return solverSubmissionRepository;
}

export function openGeneralIntentMarket(input: {
  policy: GeneralIntentPolicyV2;
  ownerSignature: `0x${string}`;
  revision: number;
  observedAtSec: number;
}) {
  return openGeneralCodingAgentCompetition(input, {
    intents: getIntentRepository(),
    profiles: getSolverProfileRepository(),
    runs: getSolverRunRepository(),
    submissions: getSolverSubmissionRepository(),
  });
}

export { ActiveManifestMismatchError };

export async function publishGeneralIntent(input: {
  policy: GeneralIntentPolicyV2;
  ownerSignature: `0x${string}`;
}) {
  assertPolicyTargetsActiveManifest(input.policy, productionCapabilityManifestV1());
  await getSolverProfileRepository().register(cobiaCodingAgentProfile);
  return getIntentRepository().create(input);
}

export async function publishOpenIntent(input: {
  policy: OpenIntentPolicyV3;
  ownerSignature: `0x${string}`;
}) {
  return getIntentRepository().create(input);
}
