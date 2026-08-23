import {
  solverDecisionClaimCommitmentV1, solverRunClaimCommitmentV1,
  type SolverDecisionClaimV1, type SolverRunClaimV1,
} from "@cobia/domain";
import type { Hash, Hex } from "viem";
import { canonicalDecisionCommitment } from "./decision-commitment";

export interface RunClient {
  startRun(input: { claim: SolverRunClaimV1; signature: Hex }): Promise<unknown>;
}

export interface DecisionClient {
  submitDecision(input: {
    claim: SolverDecisionClaimV1;
    signature: Hex;
    decision: unknown;
  }): Promise<{ state: string; submissionId?: string }>;
}

export interface RunSigner {
  signMessage(input: { message: { raw: Hash } }): Promise<Hex>;
}

function nonce(): Hash {
  return `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`;
}

export async function announceSolverRun(input: {
  client: RunClient;
  account: RunSigner;
  solverId: string;
  intent: { id: string; snapshotHash: string; competitionClosesAt: number };
  revision: number;
  nowSec?: number;
}) {
  const issuedAt = input.nowSec ?? Math.floor(Date.now() / 1_000);
  const claim: SolverRunClaimV1 = {
    version: 1, solverId: input.solverId, intentId: input.intent.id,
    revision: input.revision, snapshotHash: input.intent.snapshotHash as Hash,
    nonce: nonce(), issuedAt, expiresAt: Math.min(issuedAt + 300,
      input.intent.competitionClosesAt),
  };
  const signature = await input.account.signMessage({
    message: { raw: solverRunClaimCommitmentV1(claim) },
  });
  return input.client.startRun({ claim, signature });
}

export async function submitSolverDecision(input: {
  client: DecisionClient;
  account: RunSigner;
  solverId: string;
  intent: { id: string; snapshotHash: string; competitionClosesAt: number };
  revision: number;
  decision: unknown;
  nowSec?: number;
}) {
  const canonical = canonicalDecisionCommitment(input.decision);
  const issuedAt = input.nowSec ?? Math.floor(Date.now() / 1_000);
  const claim: SolverDecisionClaimV1 = {
    version: 1, solverId: input.solverId, intentId: input.intent.id,
    revision: input.revision, decisionHash: canonical.decisionHash,
    snapshotHash: input.intent.snapshotHash as Hash,
    nonce: nonce(), issuedAt,
    expiresAt: Math.min(issuedAt + 240, input.intent.competitionClosesAt),
  };
  if (claim.expiresAt <= claim.issuedAt) return null;
  const signature = await input.account.signMessage({
    message: { raw: solverDecisionClaimCommitmentV1(claim) },
  });
  return input.client.submitDecision({ claim, signature, decision: canonical.decision });
}
