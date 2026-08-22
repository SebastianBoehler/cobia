import { NextResponse } from "next/server";
import { getAddress, isAddress, type Address } from "viem";
import { z } from "zod";
import { missingOwnerNativeBalanceChains } from "../../../../lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ReadinessRequestSchema = z.object({
  owner: z.string().refine(isAddress),
  executionChainIds: z.array(z.union([z.literal(1), z.literal(196), z.literal(8453)]))
    .min(1).max(2),
}).strict();

export async function POST(request: Request): Promise<Response> {
  try {
    const input = ReadinessRequestSchema.parse(await request.json());
    const missingNativeBalanceChainIds = await missingOwnerNativeBalanceChains({
      owner: getAddress(input.owner) as Address,
      executionChainIds: input.executionChainIds,
    });
    return NextResponse.json({ missingNativeBalanceChainIds });
  } catch {
    return NextResponse.json({ message: "Native balance readiness could not be checked." }, { status: 503 });
  }
}
