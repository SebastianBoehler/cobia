import { commitment, type GeneralIntentPolicyV2, type GeneralIntentSnapshotV1 } from "@cobia/domain";
import type { Address } from "viem";
import {
  coordinateCompetitionProgram,
  type CompetitionCoordinateDependencies,
  type CompetitionCoordinateInput,
} from "../coding-agent-sandbox/competition-coordinator";
import type { CoordinateCapabilityInputV1 } from "../coding-agent-sandbox/coordinator";
import { cobiaCodingAgentProfile } from "../runtime/solver-catalog";

interface CompetitionRepositories {
  intents: { create(input: { policy: GeneralIntentPolicyV2; ownerSignature: `0x${string}` }): Promise<unknown> };
  profiles: { register(input: typeof cobiaCodingAgentProfile): Promise<unknown> };
  runs: CompetitionCoordinateDependencies["runs"];
  submissions: CompetitionCoordinateDependencies["submissions"];
}

export interface RunGeneralCompetitionInput {
  policy: GeneralIntentPolicyV2;
  ownerSignature: `0x${string}`;
  revision: number;
  observedAtSec: number;
}

export interface RunGeneralCompetitionDependencies {
  repositories: CompetitionRepositories;
  assertReady(policy: GeneralIntentPolicyV2): Promise<void>;
  captureSnapshot(policy: GeneralIntentPolicyV2): Promise<GeneralIntentSnapshotV1>;
  capturePortfolio(input: {
    owner: Address;
    executor: Address;
    block: { number: string; hash: `0x${string}` };
  }): Promise<CoordinateCapabilityInputV1["portfolio"]>;
  manifest: unknown;
  executor: Address;
  coordinate?: (
    input: CompetitionCoordinateInput,
    dependencies: CompetitionCoordinateDependencies,
  ) => ReturnType<typeof coordinateCompetitionProgram>;
  coordinatorDependencies?: Omit<CompetitionCoordinateDependencies, "runs" | "submissions">;
}

export async function runGeneralCodingAgentCompetition(
  input: RunGeneralCompetitionInput,
  dependencies: RunGeneralCompetitionDependencies,
) {
  const { policy } = input;
  await dependencies.assertReady(policy);
  await dependencies.repositories.profiles.register(cobiaCodingAgentProfile);
  await dependencies.repositories.intents.create({
    policy,
    ownerSignature: input.ownerSignature,
  });

  const snapshot = await dependencies.captureSnapshot(policy);
  const portfolio = await dependencies.capturePortfolio({
    owner: policy.owner,
    executor: dependencies.executor,
    block: { number: snapshot.blockNumber, hash: snapshot.blockHash },
  });
  const coordinateInput: CompetitionCoordinateInput = {
    solverId: cobiaCodingAgentProfile.id,
    revision: input.revision,
    observedAtSec: input.observedAtSec,
    validUntilSec: Math.min(
      policy.competition.closesAt,
      policy.deadline,
      input.observedAtSec + policy.maxEvidenceAgeSec,
    ),
    job: {
      requestId: policy.requestId,
      owner: policy.owner,
      policyHash: commitment(policy),
      snapshotHash: commitment(snapshot),
      manifestHash: policy.manifestHash,
      blockNumber: snapshot.blockNumber,
      blockHash: snapshot.blockHash,
    },
    policy,
    snapshot,
    portfolio,
    manifest: dependencies.manifest,
    executor: dependencies.executor,
  };
  const coordinatorDependencies = {
    runs: dependencies.repositories.runs,
    submissions: dependencies.repositories.submissions,
    ...dependencies.coordinatorDependencies,
  } as CompetitionCoordinateDependencies;
  return (dependencies.coordinate ?? coordinateCompetitionProgram)(
    coordinateInput,
    coordinatorDependencies,
  );
}
