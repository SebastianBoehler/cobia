import { NextResponse } from "next/server";
import { z } from "zod";
import { createOpenAiIntentCompiler } from "../../../../lib/intents/intent-compiler";
import { ACTION_PREFERENCES } from "../../../../lib/intents/intent-controls";
import { getAddress, isAddressEqual, type Address } from "viem";
import { isSameOrigin, walletSessionToken } from "../../../../lib/wallet-auth/http";
import {
  getWalletAuthService, walletAuthClientKey,
} from "../../../../lib/runtime/wallet-auth";
import { reusableCompilationResult, WalletSessionRejectedError } from "../../../../lib/wallet-auth/service";
import { getSolverProfileRepository } from "../../../../lib/runtime/market";
import { currentUnixSeconds } from "../../../../lib/time";
import { readPortfolio } from "../../../../lib/portfolio/read-portfolio";
import { readIntentAssetPrices } from "../../../../lib/intents/intent-asset-prices";
import { RWA_INTENT_ASSETS } from "../../../../lib/intents/capability-templates";
import { compileGeneralAssetRequestV1 } from "../../../../lib/intents/compile-general-asset-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RequestSchema = z.object({
  owner: z.string().regex(/^0x[0-9a-fA-F]{40}$/)
    .transform((value) => getAddress(value).toLowerCase() as Address),
  goal: z.string().trim().min(3).max(500),
  actionPreference: z.enum(ACTION_PREFERENCES.map(({ id }) => id)),
  generalAsset: z.object({
    input: z.object({ chainId: z.union([z.literal(1), z.literal(196)]),
      address: z.string().regex(/^0x[0-9a-fA-F]{40}$/)
        .transform((value) => getAddress(value).toLowerCase() as Address),
      maximumAtomic: z.string().regex(/^[1-9][0-9]*$/).max(78) }).strict(),
    output: z.object({ chainId: z.union([z.literal(1), z.literal(196)]),
      address: z.string().regex(/^0x[0-9a-fA-F]{40}$/)
        .transform((value) => getAddress(value).toLowerCase() as Address),
      minimumAtomic: z.string().regex(/^[1-9][0-9]*$/).max(78) }).strict(),
  }).strict().optional(),
}).strict();

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ code: "CROSS_ORIGIN_REQUEST", message: "Intent compilation must start from this site." }, { status: 403 });
  }
  const token = walletSessionToken(request);
  if (!token) {
    return NextResponse.json({ code: "WALLET_AUTH_REQUIRED", message: "Verify wallet control before compiling an intent." }, { status: 401 });
  }
  const auth = getWalletAuthService();
  let parsedRequest: z.infer<typeof RequestSchema>;
  try {
    parsedRequest = RequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ code: "INVALID_GOAL",
      message: "Describe a goal between 3 and 500 characters." }, { status: 400 });
  }
  let leaseId: string | undefined;
  try {
    const { owner, goal, actionPreference, generalAsset } = parsedRequest;
    let session;
    try {
      session = await auth.readSession(token);
      if (!isAddressEqual(session.owner, owner)) {
        throw new WalletSessionRejectedError("Wallet session owner changed");
      }
    } catch (error) {
      if (error instanceof WalletSessionRejectedError) {
        return NextResponse.json({ code: "WALLET_AUTH_REQUIRED", message: "Verify wallet control before compiling an intent." }, { status: 401 });
      }
      throw error;
    }
    let walletBalances: Record<string, string> | undefined;
    let walletAssets: Array<{ address: Address; symbol: string; decimals: number }> | undefined;
    let walletPortfolio: Awaited<ReturnType<typeof readPortfolio>> | undefined;
    let admissionGoal = goal;
    const effectiveGeneralAsset = generalAsset;
    if (actionPreference === "any" && !effectiveGeneralAsset) {
      walletPortfolio = await readPortfolio(session.owner, 196).catch(() => undefined);
      if (!walletPortfolio) {
        return NextResponse.json({ code: "WALLET_BALANCE_UNAVAILABLE",
          message: "Cobia could not read your X Layer token balance. Try again." }, { status: 503 });
      }
      walletBalances = Object.fromEntries([
        [walletPortfolio.native.symbol, walletPortfolio.native.formatted],
        ...walletPortfolio.balances.map(({ symbol, formatted }) => [symbol, formatted]),
      ]);
      walletAssets = walletPortfolio.balances.map(({ address, symbol, decimals }) => ({ address, symbol, decimals }));
      const balanceFingerprint = [walletPortfolio.native, ...walletPortfolio.balances]
        .map(({ symbol, amountAtomic, ...asset }) => `${symbol}:${amountAtomic}:${"priceUsd" in asset ? asset.priceUsd ?? "" : ""}`)
        .sort().join(",");
      admissionGoal = `${goal}\n[wallet-balances:${balanceFingerprint}]`;
    }
    if (effectiveGeneralAsset) {
      admissionGoal = `${admissionGoal}\n[general-asset:${effectiveGeneralAsset.input.chainId}:` +
        `${effectiveGeneralAsset.input.address}:${effectiveGeneralAsset.input.maximumAtomic}:` +
        `${effectiveGeneralAsset.output.chainId}:${effectiveGeneralAsset.output.address}:` +
        `${effectiveGeneralAsset.output.minimumAtomic}]`;
    }
    let assetPricesUsd: Readonly<Record<string, string>> | undefined;
    if (actionPreference === "any" && !effectiveGeneralAsset) {
      const requestedRwaSymbols = RWA_INTENT_ASSETS.filter(({ symbol }) =>
        new RegExp(`(^|[^A-Za-z0-9])@?${symbol}(?=$|[^A-Za-z0-9])`, "i").test(goal))
        .map(({ symbol }) => symbol);
      assetPricesUsd = await readIntentAssetPrices(requestedRwaSymbols).catch(() => undefined);
      if (assetPricesUsd) {
        const priceFingerprint = Object.entries(assetPricesUsd).sort(([left], [right]) =>
          left.localeCompare(right)).map(([symbol, price]) => `${symbol}:${price}`).join(",");
        admissionGoal = `${admissionGoal}\n[asset-prices:${priceFingerprint}]`;
      }
    }
    if (walletPortfolio) {
      const walletPrices = Object.fromEntries(walletPortfolio.balances
        .flatMap(({ symbol, priceUsd }) => priceUsd ? [[symbol, priceUsd] as const] : []));
      assetPricesUsd = { ...walletPrices, ...assetPricesUsd };
    }
    const admission = await auth.beginCompilation({ owner: session.owner,
      clientKey: walletAuthClientKey(request), goal: admissionGoal, actionPreference });
    if (admission.kind === "cached") {
      if (!reusableCompilationResult(admission.result, currentUnixSeconds())) {
        return NextResponse.json({ code: "COMPILATION_REFRESH_REQUIRED",
          message: "General asset evidence expired. Compile a fresh policy draft." }, {
          status: 409, headers: { "Cache-Control": "no-store", "Retry-After": "1" },
        });
      }
      return NextResponse.json(admission.result, { headers: { "Cache-Control": "no-store" } });
    }
    if (admission.kind === "limited") {
      return NextResponse.json({ code: "COMPILER_RATE_LIMITED", message: "Too many intent compilations. Try again shortly." }, {
        status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" },
      });
    }
    if (admission.kind === "busy") {
      return NextResponse.json({ code: "COMPILER_BUSY", message: "This wallet already has an intent compilation in progress." }, {
        status: 409, headers: { "Cache-Control": "no-store", "Retry-After": "5" },
      });
    }
    leaseId = admission.id;
    if (effectiveGeneralAsset) {
      const compiled = await compileGeneralAssetRequestV1({ owner, goal, ...effectiveGeneralAsset });
      const result = compiled.status === "review" ? { ...compiled, compilationLeaseId: leaseId } : compiled;
      await auth.completeCompilation(leaseId, result);
      return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    }
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("Intent compiler OpenRouter API key is unavailable");
    const model = process.env.COBIA_MODEL;
    if (!model) throw new Error("Intent compiler model is unavailable");
    const compositionAvailable = await getSolverProfileRepository().supportsCapability(
      "policy.capability-composition@1", currentUnixSeconds(),
    );
    const result = await createOpenAiIntentCompiler({
      apiKey, model, compositionAvailable, walletBalances, walletAssets, assetPricesUsd,
    }).compile(goal, actionPreference);
    await auth.completeCompilation(leaseId, result);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (leaseId) await auth.failCompilation(leaseId).catch(() => undefined);
    console.error("Intent compilation failed", error);
    return NextResponse.json({
      code: "INTENT_COMPILER_UNAVAILABLE",
      message: "The policy draft could not be compiled. Try again.",
    }, { status: 503 });
  }
}
