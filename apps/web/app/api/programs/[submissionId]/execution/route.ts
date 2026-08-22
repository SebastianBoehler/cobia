import { commitment, OpenIntentPolicyV3Schema } from "@cobia/domain";
import { NextResponse } from "next/server";
import { createPublicClient, erc20Abi, formatUnits, http, isAddressEqual, type Hex } from "viem";
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
  SOLVER_SUCCESS_FEES_ENABLED, WAIVED_SOLVER_SUCCESS_FEE,
} from "../../../../../lib/payments/launch-solver-success-fee";
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

function executionDiagnostic(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const known = new Map([
    ["Atomic execution is paused", "executor-paused"],
    ["Atomic capability registry is paused", "registry-paused"],
    ["Verifier signer is not active", "verifier-inactive"],
    ["Owner wallet is not authorized", "wallet-not-authorized"],
    ["Input token is not enabled", "input-token-disabled"],
    ["Input exceeds the active per-route cap", "route-cap-exceeded"],
    ["General program simulation evidence is stale", "execution-evidence-stale"],
  ]);
  return [...known].find(([expected]) => message.includes(expected))?.[1] ?? "unclassified";
}

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
    const executionArtifact = stored.artifacts.find(({ kind }) => kind === "execution");
    if (!executionArtifact || commitment(executionArtifact.payload) !== executionArtifact.artifactHash) {
      throw new Error("Verified execution artifact is unavailable");
    }
    const executionValue = executionArtifact.payload as { version?: number; kind?: string;
      deadline?: number; program?: { deadline?: string } };
    const deadline = executionValue.version === 3
      ? Number(executionValue.program?.deadline) : Number(executionValue.deadline);
    if (!Number.isSafeInteger(deadline)) throw new Error("Verified execution deadline is invalid");
    if (deadline <= nowSec) {
      return NextResponse.json({
        code: "EXECUTION_EXPIRED", message: "The verified execution window has closed. Create a fresh intent.",
      }, { status: 409 });
    }
    const policy = OpenIntentPolicyV3Schema.parse(stored.policy);
    let execution: Record<string, unknown>;
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
      execution = { chainId: batch.stages[0]!.chainId, programVersion: 1, approvals: [],
        transactions: batch.stages.flatMap((stage) => stage.calls.map((call) =>
          ({ ...call, stageId: stage.stageId }))),
      };
    } else {
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
      const required = BigInt(prepared.inputAmountAtomic);
      const [balance, allowance] = await Promise.all([
        client.readContract({
          address: prepared.approval.to, abi: erc20Abi, functionName: "balanceOf",
          args: [proof.owner],
        }),
        client.readContract({
          address: prepared.approval.to, abi: erc20Abi, functionName: "allowance",
          args: [proof.owner, config.COBIA_EXECUTOR_V3_ADDRESS],
        }),
      ]);
      if (balance < required) {
        const token = stored.snapshot.tokenEvidence?.find((item) =>
          isAddressEqual(item.token, prepared.approval.to));
        const needed = token ? formatUnits(required, token.decimals) : required.toString();
        const available = token ? formatUnits(balance, token.decimals) : balance.toString();
        const message = token
          ? `Wallet needs ${needed} ${token.symbol} but only holds ${available} ${token.symbol}.`
          : "The owner wallet cannot fund the signed input amount.";
        return NextResponse.json({
          code: "INPUT_BALANCE_INSUFFICIENT", message,
          inputToken: prepared.approval.to,
          requiredAtomic: required.toString(),
          availableAtomic: balance.toString(),
        }, { status: 409 });
      }
      execution = {
        chainId: 196,
        programVersion: 3,
        owner: proof.owner,
        approvals: exactApprovalCalls({
          token: prepared.approval.to,
          executor: config.COBIA_EXECUTOR_V3_ADDRESS,
          allowance,
          required,
        }),
        execution: prepared.execution,
        guarantee: "The wallet broadcasts only these independently attested calls. The atomic executor enforces the deadline and post-state bounds.",
        forecast: "Future yield, LP fees, and impermanent loss are not guaranteed.",
      };
    }
    if (!SOLVER_SUCCESS_FEES_ENABLED) return NextResponse.json({
      ...execution, successFee: WAIVED_SOLVER_SUCCESS_FEE,
    }, { headers: { "Cache-Control": "no-store" } });
    const profile = await getSolverProfileRepository().identity(stored.solverId);
    if (!profile?.attestationAddress) throw new Error("Solver payout identity is unavailable");
    const payment = readPaymentConfig();
    const feeIssuedAt = proof.expiresAt - 300;
    const feeTerms = buildSolverSuccessFeeTerms({ submissionId, solverId: stored.solverId,
      owner: proof.owner, recipient: profile.attestationAddress, treasury: payment.COBIA_TREASURY,
      realm: payment.PAYMENT_REALM, nowSec: feeIssuedAt, deadline: Math.min(deadline, proof.expiresAt) });
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
    return NextResponse.json({
      ...execution,
      successFee: { amountAtomic: feeTerms.amount, asset: feeTerms.currency,
        state: "authorized", settlesAfter: "confirmed-execution" },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const invalid = error instanceof z.ZodError;
    if (!invalid) console.warn("[program-execution] unavailable", {
      submissionId,
      failure: executionDiagnostic(error),
    });
    return NextResponse.json({
      code: invalid ? "INVALID_REQUEST" : "EXECUTION_UNAVAILABLE",
      message: invalid ? "Execution request is invalid." : "Program execution is unavailable.",
    }, { status: invalid ? 400 : 409 });
  }
}
