import { commitment } from "@cobia/domain";
import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { z } from "zod";
import { validatePurchasedRouteIntegrity } from "@/lib/db/purchased-route-artifact";
import type { RehearsalFailureCode } from "@/lib/db/rehearsals";
import { runPurchasedRouteRehearsal } from "@/lib/execution-v2/anvil-rehearsal";
import {
  ExecutionRehearsalProofSchema,
  executionRehearsalCommitment,
  verifyExecutionRehearsalProof,
} from "@/lib/execution-v2/rehearsal-proof";
import { readPaymentTermsConfig } from "@/lib/payments/config";
import {
  getPurchaseRepository,
  getRehearsalRepository,
  getRequestRepository,
} from "@/lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HASH = /^0x[0-9a-fA-F]{64}$/;
const BodySchema = z.object({
  proof: ExecutionRehearsalProofSchema,
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
}).strict();

function json(body: unknown, status = 200): Response {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function failureCode(error: unknown): RehearsalFailureCode {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("timed out")) return "REHEARSAL_TIMEOUT";
  if (message.includes("docker") || message.includes("container") ||
    message.includes("econnrefused")) return "REHEARSAL_UNAVAILABLE";
  return "PROTOCOL_REJECTED";
}

function failedResponse(code: RehearsalFailureCode): Response {
  if (code === "REHEARSAL_UNAVAILABLE") {
    return json({
      code,
      message: "The local fork runtime is unavailable.",
    }, 503);
  }
  if (code === "REHEARSAL_TIMEOUT") {
    return json({
      code,
      message: "The fork rehearsal timed out before confirmation.",
    }, 504);
  }
  return json({
    code: "PROTOCOL_REJECTED",
    message: "The purchased route did not pass fork rehearsal.",
  }, 422);
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/routes/[routeId]/execution/rehearsal">,
): Promise<Response> {
  let attemptId: string | undefined;
  try {
    const { routeId } = await context.params;
    if (!HASH.test(routeId)) {
      return json({ code: "INVALID_ROUTE_ID", message: "Purchased quote id is invalid." }, 400);
    }
    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return json({ code: "INVALID_REHEARSAL_PROOF", message: "Rehearsal proof is invalid." }, 400);
    }
    const nowSec = Math.floor(Date.now() / 1_000);
    let proof;
    try {
      proof = await verifyExecutionRehearsalProof(
        parsed.data.proof,
        parsed.data.signature as Hex,
        nowSec,
      );
    } catch {
      return json({ code: "REHEARSAL_PROOF_REJECTED", message: "Rehearsal proof was rejected." }, 403);
    }
    const expectedRealm = readPaymentTermsConfig().PAYMENT_REALM;
    if (proof.realm !== expectedRealm || proof.routeId !== routeId.toLowerCase() ||
      proof.bundleHash !== routeId.toLowerCase()) {
      return json({ code: "REHEARSAL_PROOF_REJECTED", message: "Rehearsal proof was rejected." }, 403);
    }

    const purchase = await getPurchaseRepository().getPurchasedRoute(routeId, proof.buyer);
    if (!purchase) {
      return json({ code: "NOT_FOUND", message: "Purchased quote not found for this wallet." }, 404);
    }
    const publicRequest = await getRequestRepository().getPublicRequest(purchase.requestId);
    if (!publicRequest) throw new Error("Purchased quote request is unavailable");
    const artifact = validatePurchasedRouteIntegrity({
      purchase,
      policyInput: publicRequest.policy,
      snapshotInput: publicRequest.snapshot,
      expected: { routeId, buyer: proof.buyer },
    });
    const rehearsals = getRehearsalRepository();
    const attempt = await rehearsals.begin({
      proof,
      proofHash: executionRehearsalCommitment(proof),
      nowSec,
    });
    attemptId = attempt.id;
    if (attempt.state === "passed" && attempt.trace) {
      return json({ rehearsalId: attempt.id, state: "passed", trace: attempt.trace });
    }
    if (attempt.state === "failed") {
      return failedResponse(attempt.failureCode as RehearsalFailureCode);
    }

    try {
      const trace = await runPurchasedRouteRehearsal(artifact);
      const traceRecord = { ...trace };
      await rehearsals.complete(attempt.id, {
        registryHash: trace.registryHash,
        snapshotBlockHash: trace.snapshot.blockHash,
        engineVersion: trace.engineVersion,
        traceHash: commitment(traceRecord),
        trace: traceRecord,
      });
      return json({ rehearsalId: attempt.id, state: "passed", trace });
    } catch (error) {
      const code = failureCode(error);
      await rehearsals.fail(attempt.id, code);
      return failedResponse(code);
    }
  } catch {
    if (attemptId) {
      try {
        await getRehearsalRepository().fail(attemptId, "REHEARSAL_FAILED");
      } catch {
        // Preserve the original safe response; storage recovery remains inspectable.
      }
    }
    return json({
      code: "REHEARSAL_FAILED",
      message: "Could not rehearse the purchased route.",
    }, 503);
  }
}
