import {
  parseSolverProfileClaimV1,
  SolverProfileClaimV1Schema,
  solverProfileClaimCommitmentV1,
} from "@cobia/domain";
import { NextResponse } from "next/server";
import { isAddressEqual, recoverMessageAddress, type Hex } from "viem";
import { z } from "zod";
import { getSolverProfileRepository } from "../../../lib/runtime/market";
import { PUBLIC_CACHE_30_SECONDS } from "../../../lib/http/cache-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  claim: SolverProfileClaimV1Schema,
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
}).strict();

class InvalidSolverSignatureError extends Error {}
class InvalidSolverProfileError extends Error {}

export async function GET(): Promise<Response> {
  const observedAt = Math.floor(Date.now() / 1_000);
  try {
    const profiles = await getSolverProfileRepository().list(observedAt);
    return NextResponse.json({
      observedAt,
      solvers: profiles.filter((profile) => profile !== null).map((profile) => ({
        id: profile.id,
        displayName: profile.displayName,
        operatorKind: profile.operatorKind,
        declaredCapabilities: profile.declaredCapabilities,
        performance: profile.performance,
        links: { profile: `/solvers/${profile.id}` },
      })),
    }, { headers: { "Cache-Control": PUBLIC_CACHE_30_SECONDS } });
  } catch {
    return NextResponse.json({
      code: "SOLVER_LIST_FAILED",
      message: "Solver profiles could not be listed.",
    }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = BodySchema.parse(await request.json());
    const nowSec = Math.floor(Date.now() / 1_000);
    let claim;
    try { claim = parseSolverProfileClaimV1(body.claim, nowSec); }
    catch { throw new InvalidSolverProfileError(); }
    const signer = await recoverMessageAddress({
      message: { raw: solverProfileClaimCommitmentV1(claim) },
      signature: body.signature as Hex,
    });
    if (!isAddressEqual(signer, claim.operator)) throw new InvalidSolverSignatureError();
    await getSolverProfileRepository().register({
      id: claim.solverId,
      displayName: claim.displayName,
      operatorKind: "community",
      attestationAddress: claim.operator,
      declaredCapabilities: claim.declaredCapabilities,
    });
    return NextResponse.json({
      solverId: claim.solverId,
      operator: claim.operator,
      links: { profile: `/solvers/${claim.solverId}` },
    }, { status: 201 });
  } catch (error) {
    const invalid = error instanceof z.ZodError || error instanceof InvalidSolverProfileError;
    const invalidSignature = error instanceof InvalidSolverSignatureError;
    return NextResponse.json({
      code: invalid ? "INVALID_SOLVER_PROFILE"
        : invalidSignature ? "INVALID_SOLVER_SIGNATURE" : "SOLVER_REGISTRATION_FAILED",
      message: invalid ? "The solver profile claim is invalid."
        : invalidSignature ? "The solver signature is invalid."
          : "The solver profile could not be registered.",
    }, { status: invalid || invalidSignature ? 400 : 503 });
  }
}
