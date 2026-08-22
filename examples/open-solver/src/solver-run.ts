import {
  solverRunClaimCommitmentV1, type SolverRunClaimV1,
} from "@cobia/domain";
import type { Hash, Hex } from "viem";

interface RunClient {
  startRun(input: { claim: SolverRunClaimV1; signature: Hex }): Promise<unknown>;
}

interface RunSigner {
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
