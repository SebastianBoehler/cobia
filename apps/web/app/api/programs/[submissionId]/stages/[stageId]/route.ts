import { commitment } from "@cobia/domain";
import { NextResponse } from "next/server";
import { isAddressEqual, type Hex } from "viem";
import { z } from "zod";
import { verifyAgentExecutionAccessProof } from "../../../../../../lib/coding-agent-sandbox/execution-access";
import {
  parseGeneralAssetExecutionBundleV4,
} from "../../../../../../lib/execution-v4/stage-artifact";
import {
  createGeneralAssetStageChainReaderV4,
  reconcileGeneralAssetStageLiveV4,
} from "../../../../../../lib/execution-v4/live-stage-reconciliation";
import {
  generalAssetProgramRecordV4,
  generalAssetStageRecordV4,
} from "../../../../../../lib/execution-v4/stage-record";
import {
  getGeneralAssetExecutionRepository,
  getSolverSubmissionRepository,
} from "../../../../../../lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ProofFields = {
  proof: z.unknown(),
  ownerSignature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
};
const BodySchema = z.discriminatedUnion("action", [
  z.object({ ...ProofFields, action: z.literal("arm") }).strict(),
  z.object({ ...ProofFields, action: z.literal("submitted"),
    transactionHash: z.string().regex(/^0x[0-9a-f]{64}$/)
      .transform((value) => value as `0x${string}`) }).strict(),
  z.object({ ...ProofFields, action: z.literal("reconcile") }).strict(),
]);

export async function POST(
  request: Request,
  context: RouteContext<"/api/programs/[submissionId]/stages/[stageId]">,
) {
  const { submissionId, stageId } = await context.params;
  try {
    const body = BodySchema.parse(await request.json());
    const nowSec = Math.floor(Date.now() / 1_000);
    const proof = await verifyAgentExecutionAccessProof({
      proof: body.proof, signature: body.ownerSignature as Hex, nowSec,
    });
    if (proof.programId !== submissionId || proof.realm !== new URL(request.url).host) {
      return NextResponse.json({ code: "INVALID_PROOF", message: "Stage proof does not match this program." },
        { status: 403 });
    }
    const stored = await getSolverSubmissionRepository().getExecutionContext(submissionId);
    if (!stored || !stored.owner || !isAddressEqual(stored.owner as `0x${string}`, proof.owner)) {
      return NextResponse.json({ code: "NOT_FOUND", message: "Owner program not found." }, { status: 404 });
    }
    const artifact = stored.artifacts.find(({ kind }) => kind === "execution");
    if (!artifact || commitment(artifact.payload) !== artifact.artifactHash || stored.state !== "attested") {
      throw new Error("Attested execution artifact is unavailable");
    }
    const bundle = parseGeneralAssetExecutionBundleV4(artifact.payload);
    if (!isAddressEqual(bundle.owner, proof.owner) || bundle.deadline <= nowSec) {
      throw new Error("General asset execution is no longer available");
    }
    const stage = bundle.stages.find((candidate) => candidate.stageId === stageId);
    if (!stage) return NextResponse.json({ code: "NOT_FOUND", message: "Stage not found." }, { status: 404 });
    const repository = getGeneralAssetExecutionRepository();
    if (body.action === "reconcile") {
      const reconciled = await reconcileGeneralAssetStageLiveV4({
        bundle, stageId: stage.stageId, repository,
        reader: createGeneralAssetStageChainReaderV4(stage.chainId),
      });
      return NextResponse.json({ stageId: stage.stageId, state: reconciled.state,
        delivery: stage.delivery }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "submitted") {
      const submitted = await repository.recordSubmission(bundle.programId, stage.stageId, body.transactionHash);
      return NextResponse.json({ stageId: stage.stageId, state: submitted.state }, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    await repository.prepareStage({
      program: generalAssetProgramRecordV4(bundle),
      stage: generalAssetStageRecordV4(bundle, stage),
    });
    const armed = await repository.armStage(bundle.programId, stage.stageId);
    return NextResponse.json({
      stageId: stage.stageId,
      state: armed.state,
      transaction: stage.transaction,
      guarantee: "The broadcasting state was committed before this exact transaction was returned.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const invalid = error instanceof z.ZodError;
    if (!invalid) console.warn("[general-asset-stage] unavailable", { submissionId, stageId });
    return NextResponse.json({
      code: invalid ? "INVALID_STAGE_REQUEST" : "STAGE_UNAVAILABLE",
      message: invalid ? "Stage request is invalid." : "Stage execution is unavailable.",
    }, { status: invalid ? 400 : 409 });
  }
}
