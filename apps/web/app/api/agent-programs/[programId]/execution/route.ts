import { NextResponse } from "next/server";
import { createPublicClient, encodeFunctionData, erc20Abi, http, isAddressEqual, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import { xLayer } from "@/lib/chain/xlayer";
import { prepareAgentExecutionV1 } from "@/lib/coding-agent-sandbox/agent-execution";
import {
  createAgentExecutorReadV1,
  assertAgentExecutorReadyV1,
} from "@/lib/coding-agent-sandbox/executor-preflight";
import { verifyAgentExecutionAccessProof } from "@/lib/coding-agent-sandbox/execution-access";
import { readCodingAgentRuntimeConfig } from "@/lib/env";
import { getAgentProgramRepository } from "@/lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  proof: z.unknown(),
  ownerSignature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
}).strict();

export async function POST(
  request: Request,
  context: RouteContext<"/api/agent-programs/[programId]/execution">,
) {
  const { programId } = await context.params;
  try {
    const body = BodySchema.parse(await request.json());
    const proof = await verifyAgentExecutionAccessProof({
      proof: body.proof,
      signature: body.ownerSignature as Hex,
      nowSec: Math.floor(Date.now() / 1_000),
    });
    if (proof.programId !== programId || proof.realm !== new URL(request.url).host) {
      return NextResponse.json({ code: "INVALID_PROOF", message: "Execution proof does not match this program." }, { status: 403 });
    }
    const repository = getAgentProgramRepository();
    const stored = await repository.getExecutionContext(programId);
    if (!stored || !isAddressEqual(stored.owner as `0x${string}`, proof.owner)) {
      return NextResponse.json({ code: "NOT_FOUND", message: "Owner program not found." }, { status: 404 });
    }
    const config = readCodingAgentRuntimeConfig();
    const prepared = prepareAgentExecutionV1({
      context: stored,
      owner: proof.owner,
      executor: config.COBIA_EXECUTOR_V2_ADDRESS,
      nowSec: Math.floor(Date.now() / 1_000),
    });
    const client = createPublicClient({
      chain: xLayer,
      transport: http(config.XLAYER_RPC_URL, { timeout: 15_000 }),
      cacheTime: 0,
    });
    await assertAgentExecutorReadyV1({
      executor: config.COBIA_EXECUTOR_V2_ADDRESS,
      expectedCodeHash: config.COBIA_EXECUTOR_V2_CODE_HASH,
      expectedVerifier: privateKeyToAccount(config.COBIA_VERIFIER_PRIVATE_KEY).address,
      owner: proof.owner,
      inputToken: prepared.approval.to,
      inputAmount: BigInt(prepared.inputAmountAtomic),
      read: createAgentExecutorReadV1(client),
    });
    const allowance = await client.readContract({
      address: prepared.approval.to,
      abi: erc20Abi,
      functionName: "allowance",
      args: [proof.owner, config.COBIA_EXECUTOR_V2_ADDRESS],
    });
    const approvalCalls = allowance >= BigInt(prepared.inputAmountAtomic) ? [] : [
      ...(allowance > 0n ? [{
        to: prepared.approval.to,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [config.COBIA_EXECUTOR_V2_ADDRESS, 0n],
        }),
        value: "0x0" as const,
      }] : []),
      prepared.approval,
    ];
    return NextResponse.json({
      chainId: 196,
      owner: proof.owner,
      approvals: approvalCalls,
      execution: prepared.execution,
      guarantee: "The atomic executor enforces the attested final-balance constraints and deadline.",
      forecast: "Future APY, LP fees, and impermanent loss are not guaranteed.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const invalid = error instanceof z.ZodError;
    return NextResponse.json({
      code: invalid ? "INVALID_REQUEST" : "EXECUTION_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Agent execution is unavailable.",
    }, { status: invalid ? 400 : 409 });
  }
}
