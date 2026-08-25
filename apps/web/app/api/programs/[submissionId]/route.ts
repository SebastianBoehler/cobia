import { NextResponse } from "next/server";
import { createPublicClient, erc20Abi, http, type Address } from "viem";
import { z } from "zod";
import { xLayer } from "../../../../lib/chain/xlayer";
import { readConfirmedBalanceChanges } from "../../../../lib/coding-agent-sandbox/confirmed-balance-changes";
import { readCodingAgentV3ExecutionConfig } from "../../../../lib/env";
import { getSolverSubmissionRepository } from "../../../../lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IdSchema = z.string().uuid();

function count(value: unknown, key: string): number {
  if (!value || typeof value !== "object") return 0;
  const entries = (value as Record<string, unknown>)[key];
  return Array.isArray(entries) ? entries.length : 0;
}

async function enrichReceipt(
  artifacts: Array<{ kind: string; artifactHash: string; payload: unknown }>,
) {
  const receipt = artifacts.find(({ kind }) => kind === "receipt");
  const parsed = z.object({
    owner: z.string(),
    blockNumber: z.string().regex(/^[1-9][0-9]*$/).optional(),
    receipts: z.array(z.object({
      blockNumber: z.string().regex(/^[1-9][0-9]*$/),
    }).passthrough()).min(1).optional(),
    balanceChanges: z.array(z.unknown()).optional(),
  }).passthrough().safeParse(receipt?.payload);
  if (!parsed.success || parsed.data.balanceChanges) return receipt?.payload;
  const blockNumber = parsed.data.blockNumber ?? parsed.data.receipts?.at(-1)?.blockNumber;
  if (!blockNumber) return receipt?.payload;
  try {
    const client = createPublicClient({ chain: xLayer, transport: http(
      readCodingAgentV3ExecutionConfig().XLAYER_RPC_URL, { timeout: 15_000 },
    ), cacheTime: 0 });
    const evidence = artifacts.find(({ kind }) => kind === "evidence")?.payload;
    const balanceChanges = await readConfirmedBalanceChanges({
      evidence,
      owner: parsed.data.owner as Address,
      blockNumber: BigInt(blockNumber),
      readBalance: (token, owner, blockNumber) => client.readContract({
        address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner], blockNumber,
      }),
    });
    return balanceChanges.length > 0 ? { ...parsed.data, blockNumber, balanceChanges } : receipt?.payload;
  } catch {
    return receipt?.payload;
  }
}

async function publicArtifacts(
  artifacts: Array<{ kind: string; artifactHash: string; payload: unknown }>,
  executable: boolean,
) {
  const enrichedReceipt = await enrichReceipt(artifacts);
  return Object.fromEntries(artifacts.map((artifact) => {
    if (artifact.kind === "provenance") {
      return [artifact.kind, {
        artifactHash: artifact.artifactHash,
        summary: {
          commandCount: count(artifact.payload, "commands"),
          fileCount: count(artifact.payload, "files"),
          networkRequestCount: count(artifact.payload, "networkRequests"),
        },
      }];
    }
    if (artifact.kind === "authorization" && !executable) {
      return [artifact.kind, { artifactHash: artifact.artifactHash }];
    }
    return [artifact.kind, { artifactHash: artifact.artifactHash,
      payload: artifact.kind === "receipt" ? enrichedReceipt : artifact.payload }];
  }));
}

export async function GET(
  _request: Request,
  context: RouteContext<"/api/programs/[submissionId]">,
): Promise<Response> {
  const { submissionId: value } = await context.params;
  const parsed = IdSchema.safeParse(value);
  if (!parsed.success) {
    return NextResponse.json({ code: "INVALID_SUBMISSION_ID", message: "Program id is invalid." }, { status: 400 });
  }
  try {
    const submission = await getSolverSubmissionRepository()
      .read(parsed.data, Math.floor(Date.now() / 1_000));
    if (!submission) {
      return NextResponse.json({ code: "NOT_FOUND", message: "Program not found." }, { status: 404 });
    }
    const executable = submission.presentationState === "current" && submission.state === "attested";
    return NextResponse.json({
      submission: {
        id: submission.id, solverId: submission.solverId, revision: submission.revision,
        programHash: submission.programHash, state: submission.presentationState,
        validUntil: submission.validUntil.toISOString(), blockNumber: submission.blockNumber,
        blockHash: submission.blockHash, failureCodes: submission.failureCodes,
        owner: submission.owner, displayGoal: submission.displayGoal,
        objective: submission.objective, executable,
      },
      artifacts: await publicArtifacts(submission.artifacts, executable),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({
      code: "PROGRAM_READ_FAILED", message: "The solver program could not be read.",
    }, { status: 503 });
  }
}
