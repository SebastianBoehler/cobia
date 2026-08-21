import { commitment, OpenIntentPolicyV3Schema } from "@cobia/domain";
import { NextResponse } from "next/server";
import { createPublicClient, erc20Abi, http, isAddressEqual, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import { xLayer } from "../../../../../lib/chain/xlayer";
import {
  exactApprovalCalls, prepareAgentExecutionV3,
} from "../../../../../lib/coding-agent-sandbox/agent-execution-v3";
import {
  assertAgentExecutorReadyV1, createAgentExecutorReadV1,
} from "../../../../../lib/coding-agent-sandbox/executor-preflight";
import { verifyAgentExecutionAccessProof } from "../../../../../lib/coding-agent-sandbox/execution-access";
import { readCodingAgentV3ExecutionConfig } from "../../../../../lib/env";
import { readPaymentConfig } from "../../../../../lib/payments/config";
import {
  buildSolverSuccessFeeTerms, parseSolverSuccessFeeCredential,
  solverSuccessFeeRequiredResponse,
} from "../../../../../lib/payments/solver-success-fee";
import { deriveCapabilityAuthorityV2 } from "../../../../../lib/open-exchange/capability-authority";
import {
  getSolverProfileRepository, getSolverSubmissionRepository, getSolverSuccessFeeRepository,
} from "../../../../../lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  proof: z.unknown(),
  ownerSignature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
}).strict();

export async function POST(
  request: Request,
  context: RouteContext<"/api/programs/[submissionId]/execution">,
) {
  const { submissionId } = await context.params;
  try {
    const body = BodySchema.parse(await request.json());
    const nowSec = Math.floor(Date.now() / 1_000);
    const proof = await verifyAgentExecutionAccessProof({
      proof: body.proof, signature: body.ownerSignature as Hex, nowSec,
    });
    if (proof.programId !== submissionId || proof.realm !== new URL(request.url).host) {
      return NextResponse.json({
        code: "INVALID_PROOF", message: "Execution proof does not match this program.",
      }, { status: 403 });
    }
    const stored = await getSolverSubmissionRepository().getExecutionContext(submissionId);
    if (!stored || !isAddressEqual(stored.owner as `0x${string}`, proof.owner)) {
      return NextResponse.json({ code: "NOT_FOUND", message: "Owner program not found." }, { status: 404 });
    }
    const profile = await getSolverProfileRepository().identity(stored.solverId);
    if (!profile?.attestationAddress) throw new Error("Solver payout identity is unavailable");
    const executionArtifact = stored.artifacts.find(({ kind }) => kind === "execution");
    if (!executionArtifact || commitment(executionArtifact.payload) !== executionArtifact.artifactHash) {
      throw new Error("Verified execution artifact is unavailable");
    }
    const executionValue = executionArtifact.payload as { version?: number; kind?: string;
      deadline?: number; program?: { deadline?: string } };
    const deadline = executionValue.version === 3
      ? Number(executionValue.program?.deadline) : Number(executionValue.deadline);
    if (!Number.isSafeInteger(deadline) || deadline <= nowSec) throw new Error("Verified execution has expired");
    const payment = readPaymentConfig();
    const feeIssuedAt = proof.expiresAt - 300;
    const feeTerms = buildSolverSuccessFeeTerms({ submissionId, solverId: stored.solverId,
      owner: proof.owner, recipient: profile.attestationAddress, treasury: payment.COBIA_TREASURY,
      realm: payment.PAYMENT_REALM, nowSec: feeIssuedAt, deadline: Math.min(deadline, proof.expiresAt) });
    const policy = OpenIntentPolicyV3Schema.parse(stored.policy);
    const feeCap = policy.limits.maxSolverFeeAtomic;
    if (feeCap !== undefined && BigInt(feeTerms.amount) > BigInt(feeCap)) {
      return NextResponse.json({ code: "SOLVER_FEE_CAP_EXCEEDED",
        message: "This program's success fee exceeds the signed intent cap." }, { status: 409 });
    }
    if (!request.headers.has("authorization")) return solverSuccessFeeRequiredResponse(feeTerms);
    const fee = await parseSolverSuccessFeeCredential({ request, terms: feeTerms,
      owner: proof.owner, nowSec });
    await getSolverSuccessFeeRepository().authorize({ submissionId, solverId: stored.solverId,
      owner: proof.owner.toLowerCase() as `0x${string}`,
      recipient: profile.attestationAddress.toLowerCase() as `0x${string}`,
      amountAtomic: feeTerms.amount, termsHash: fee.termsHash, terms: feeTerms,
      credentialHash: fee.credentialHash, credential: fee.credential,
      expiresAtSec: feeTerms.expiresAt });
    if (executionValue.kind === "wallet-call-batch") {
      const batch = z.object({ version: z.literal(1), kind: z.literal("wallet-call-batch"),
        owner: z.string(), deadline: z.number().int(), assurance: z.literal("exact-call-fork-replay"),
        stages: z.array(z.object({ stageId: z.string(), chainId: z.union([
          z.literal(1), z.literal(196), z.literal(8453),
        ]),
          calls: z.array(z.object({ to: z.string(), data: z.string(), value: z.string() }).strict()) }).strict()),
      }).strict().refine((value) => new Set(value.stages.map(({ chainId }) => chainId)).size === 1, {
        message: "Wallet batch must execute on one chain",
      }).parse(executionArtifact.payload);
      if (!isAddressEqual(batch.owner as `0x${string}`, proof.owner) || stored.state !== "attested") {
        throw new Error("Open transaction batch is not executable by this owner");
      }
      return NextResponse.json({ chainId: batch.stages[0]!.chainId, programVersion: 1, approvals: [],
        transactions: batch.stages.flatMap((stage) => stage.calls.map((call) =>
          ({ ...call, stageId: stage.stageId }))),
        successFee: { amountAtomic: feeTerms.amount, asset: feeTerms.currency,
          state: "authorized", settlesAfter: "confirmed-execution" },
      }, { headers: { "Cache-Control": "no-store" } });
    }
    const config = readCodingAgentV3ExecutionConfig();
    const authority = deriveCapabilityAuthorityV2(stored.policy, stored.snapshot);
    const prepared = prepareAgentExecutionV3({
      context: { ...stored, policy: authority.policy, snapshot: authority.snapshot,
        policyHash: commitment(authority.policy), snapshotHash: commitment(authority.snapshot),
        manifestHash: authority.policy.manifestHash },
      owner: proof.owner, executor: config.COBIA_EXECUTOR_V3_ADDRESS, nowSec,
    });
    const client = createPublicClient({
      chain: xLayer, transport: http(config.XLAYER_RPC_URL, { timeout: 15_000 }), cacheTime: 0,
    });
    await assertAgentExecutorReadyV1({
      executor: config.COBIA_EXECUTOR_V3_ADDRESS,
      expectedCodeHash: config.COBIA_EXECUTOR_V3_CODE_HASH,
      expectedVerifier: privateKeyToAccount(config.COBIA_VERIFIER_PRIVATE_KEY).address,
      owner: proof.owner,
      inputToken: prepared.approval.to,
      inputAmount: BigInt(prepared.inputAmountAtomic),
      read: createAgentExecutorReadV1(client),
    });
    const allowance = await client.readContract({
      address: prepared.approval.to, abi: erc20Abi, functionName: "allowance",
      args: [proof.owner, config.COBIA_EXECUTOR_V3_ADDRESS],
    });
    return NextResponse.json({
      chainId: 196,
      programVersion: 3,
      owner: proof.owner,
      approvals: exactApprovalCalls({
        token: prepared.approval.to,
        executor: config.COBIA_EXECUTOR_V3_ADDRESS,
        allowance,
        required: BigInt(prepared.inputAmountAtomic),
      }),
      execution: prepared.execution,
      successFee: { amountAtomic: feeTerms.amount, asset: feeTerms.currency,
        state: "authorized", settlesAfter: "confirmed-execution" },
      guarantee: "The wallet broadcasts only these independently attested calls. The atomic executor enforces the deadline and post-state bounds.",
      forecast: "Future yield, LP fees, and impermanent loss are not guaranteed.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const invalid = error instanceof z.ZodError;
    return NextResponse.json({
      code: invalid ? "INVALID_REQUEST" : "EXECUTION_UNAVAILABLE",
      message: invalid ? "Execution request is invalid." : "Program execution is unavailable.",
    }, { status: invalid ? 400 : 409 });
  }
}
