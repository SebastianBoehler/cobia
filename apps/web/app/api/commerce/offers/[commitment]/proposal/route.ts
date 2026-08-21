import { NextResponse } from "next/server";
import { createPublicClient, erc20Abi, http, isAddress } from "viem";
import { base } from "viem/chains";
import { z } from "zod";
import { xLayer } from "../../../../../../lib/chain/xlayer";
import { buildReferenceCommerceProposalV1 } from "../../../../../../lib/commerce/reference-proposal";
import { productionCommerceMerchantManifestV1 } from "../../../../../../lib/commerce/production-manifest";
import { readCommerceRuntimeConfig } from "../../../../../../lib/env";
import { getCommerceOfferRepository } from "../../../../../../lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({ owner: z.string().refine(isAddress) }).strict();

export async function POST(request: Request, context: RouteContext<
  "/api/commerce/offers/[commitment]/proposal"
>) {
  try {
    const { commitment } = await context.params;
    const { owner } = BodySchema.parse(await request.json());
    const offer = await getCommerceOfferRepository().get(commitment);
    if (!offer) return NextResponse.json({ code: "OFFER_NOT_FOUND" }, { status: 404 });
    const config = readCommerceRuntimeConfig();
    const onBase = offer.payment.chainId === 8453;
    const client = createPublicClient({ chain: onBase ? base : xLayer,
      transport: http(onBase ? config.BASE_RPC_URL : config.XLAYER_RPC_URL, { timeout: 15_000 }),
      cacheTime: 0 });
    const block = await client.getBlock();
    if (!block.hash || block.number === null) throw new Error("Payment-chain anchor is unavailable");
    const balance = await client.readContract({
      address: offer.payment.asset,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
      blockNumber: block.number,
    });
    const required = BigInt(offer.payment.atomicAmount);
    if (balance < required) {
      const network = onBase ? "Base" : "X Layer";
      return NextResponse.json({
        code: "INSUFFICIENT_PAYMENT_BALANCE",
        message: `Insufficient payment-token balance on ${network}: ${balance} atomic available, ${required} required.`,
      }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json(buildReferenceCommerceProposalV1({ offer,
      manifest: productionCommerceMerchantManifestV1(), owner,
      executor: config.COBIA_EXECUTOR_V3_ADDRESS, nowSec: Math.floor(Date.now() / 1_000),
      block: { number: block.number, hash: block.hash } }), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const invalid = error instanceof z.ZodError;
    return NextResponse.json({
      code: invalid ? "INVALID_REQUEST" : "PROPOSAL_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Commerce proposal is unavailable.",
    }, { status: invalid ? 400 : 409 });
  }
}
