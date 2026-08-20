import {
  SolverDecisionClaimV1Schema,
  solverDecisionClaimCommitmentV1,
} from "@cobia/domain";
import { eq } from "drizzle-orm";
import type { Hex } from "viem";
import { z } from "zod";
import type { CobiaDatabase } from "./client";
import { cobiaSolverDecisionClaims } from "./schema";

const SignatureSchema = z.string().regex(/^0x[0-9a-fA-F]{130}$/).transform((value) => value as Hex);

export class SolverDecisionReplayError extends Error {}

function uniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export function createSolverDecisionClaimRepository(db: CobiaDatabase) {
  return {
    async consume(value: { claim: unknown; signature: string; decision: unknown }) {
      const claim = SolverDecisionClaimV1Schema.parse(value.claim);
      const signature = SignatureSchema.parse(value.signature);
      const claimHash = solverDecisionClaimCommitmentV1(claim);
      try {
        return await db.transaction(async (tx) => {
          const replay = await tx.query.cobiaSolverDecisionClaims.findFirst({
            where: eq(cobiaSolverDecisionClaims.nonce, claim.nonce),
          });
          if (replay) throw new SolverDecisionReplayError("Solver decision nonce already consumed");
          const rows = await tx.insert(cobiaSolverDecisionClaims).values({
            nonce: claim.nonce,
            claimHash,
            intentId: claim.intentId,
            solverId: claim.solverId,
            claim,
            signature,
            decision: value.decision,
          }).returning();
          if (!rows[0]) throw new Error("Solver decision claim was not stored");
          return rows[0];
        });
      } catch (error) {
        if (error instanceof SolverDecisionReplayError || uniqueViolation(error)) {
          throw new SolverDecisionReplayError("Solver decision claim was already consumed");
        }
        throw error;
      }
    },
  };
}
