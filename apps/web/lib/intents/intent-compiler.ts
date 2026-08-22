import { z } from "zod";
import {
  CONVERSION_INTENT_ASSETS, decimalToAtomic, INTENT_ASSETS, NATIVE_INTENT_ASSET, RWA_INTENT_ASSETS,
  type IntentReceiptValues,
} from "./capability-templates";
import { deriveMarketMinimum, formatAtomicAmount } from "./market-minimum";
import {
  requestedInputAmount, requestedRoundTripAsset, requestedRwaInput, requestedRwaTarget,
  resolveSimpleReceipt,
} from "./deterministic-intent-draft";
import type { ActionPreference } from "./intent-controls";
import {
  COMPOSITION_CAPABILITY_IDS,
  resolveCompositionDraft,
  type ComposedIntentDraft,
} from "./composition-draft";
import { resolveRegisteredCompositionGoal } from "./registered-composition-goal";
import { preserveExactTaggedWalletInputs } from "./exact-wallet-inputs";
import type { WalletBalances } from "./wallet-balance-request";
import { INTENT_COMPILER_INSTRUCTIONS, INTENT_TEMPLATE_CONTRACTS } from "./intent-compiler-contract";
import {
  ConversionModelDraftSchema, resolveConversionDraft, type StagedConversionDraft,
  type WalletIntentAsset,
} from "./staged-conversion-draft";

const TemplateSchema = z.enum(["aave-supply", "exact-input-swap", "round-trip", "rwa-acquisition"]);
const CompilationSchema = z.object({
  status: z.enum(["review", "clarification"]),
  question: z.string().min(1).nullable(),
  kind: z.enum(["simple", "composed", "conversion"]),
  templateId: TemplateSchema,
  inputSymbol: z.string().min(1),
  outputSymbol: z.string().min(1),
  amount: z.string(),
  walletShareBps: z.number().int().min(1).max(10_000).nullable().optional().default(null),
  minimum: z.string(),
  jurisdiction: z.string().regex(/^[A-Z]{2}$/).nullable(),
  composed: z.unknown().nullable(),
  conversion: z.unknown().nullable().optional().default(null),
}).strict();

export type IntentCompilation =
  | { status: "review"; values: IntentReceiptValues }
  | { status: "review"; values: ComposedIntentDraft }
  | { status: "review"; values: StagedConversionDraft }
  | { status: "clarification"; question: string };

interface Options {
  apiKey: string;
  model: string;
  fetcher?: typeof fetch;
  compositionAvailable?: boolean;
  walletBalances?: WalletBalances;
  assetPricesUsd?: Readonly<Record<string, string>>;
  walletAssets?: readonly WalletIntentAsset[];
}

function schema() {
  return {
    type: "object",
    properties: {
      status: { type: "string", enum: ["review", "clarification"] },
      question: { type: ["string", "null"], minLength: 1 },
      kind: { type: "string", enum: ["simple", "composed", "conversion"] },
      templateId: { type: "string", enum: TemplateSchema.options },
      inputSymbol: { type: "string", enum: ["OKB", ...INTENT_ASSETS.map(({ symbol }) => symbol), "USDC"] },
      outputSymbol: { type: "string", enum: [
        ...CONVERSION_INTENT_ASSETS.map(({ symbol }) => symbol), ...RWA_INTENT_ASSETS.map(({ symbol }) => symbol),
      ] },
      amount: { type: "string" },
      walletShareBps: { type: ["integer", "null"], minimum: 1, maximum: 10_000 },
      minimum: { type: "string" },
      jurisdiction: { type: ["string", "null"], pattern: "^[A-Z]{2}$" },
      composed: { anyOf: [{ type: "null" }, {
        type: "object",
        properties: {
          inputSymbol: { type: "string", enum: INTENT_ASSETS.map(({ symbol }) => symbol) },
          amount: { type: "string" },
          capabilityIds: { type: "array", items: { type: "string",
            enum: [...COMPOSITION_CAPABILITY_IDS] } },
          maxConversionLossBps: { type: "integer", minimum: 0, maximum: 500 },
          deadlineMinutes: { type: "integer", minimum: 1, maximum: 30 },
        },
        required: ["inputSymbol", "amount", "capabilityIds", "maxConversionLossBps", "deadlineMinutes"],
        additionalProperties: false,
      }] },
      conversion: { anyOf: [{ type: "null" }, {
        type: "object",
        properties: {
          inputs: { type: "array", minItems: 1, maxItems: 8, items: { anyOf: [{
            type: "object",
            properties: {
              symbol: { type: "string" }, amount: { type: "string", minLength: 1 },
              walletShareBps: { type: "null" },
            },
            required: ["symbol", "amount", "walletShareBps"], additionalProperties: false,
          }, {
            type: "object",
            properties: {
              symbol: { type: "string" }, amount: { type: "string", enum: [""] },
              walletShareBps: { type: "integer", minimum: 1, maximum: 10_000 },
            },
            required: ["symbol", "amount", "walletShareBps"], additionalProperties: false,
          }] } },
          outputSymbol: { type: "string", enum: CONVERSION_INTENT_ASSETS.map(({ symbol }) => symbol) },
          minimumOutput: { type: "string" },
          minimumStages: { type: "integer", minimum: 1, maximum: 8 },
        },
        required: ["inputs", "outputSymbol", "minimumOutput", "minimumStages"],
        additionalProperties: false,
      }] },
    },
    required: ["status", "question", "kind", "templateId", "inputSymbol", "outputSymbol", "amount", "walletShareBps", "minimum", "jurisdiction", "composed", "conversion"],
    additionalProperties: false,
  } as const;
}

function outputText(raw: unknown) {
  const response = z.object({ status: z.string(), output: z.array(z.unknown()) }).passthrough().parse(raw);
  if (response.status !== "completed") throw new Error("Intent compiler did not complete");
  const texts = response.output.flatMap((item) => {
    const message = z.object({ type: z.literal("message"), status: z.literal("completed"),
      content: z.array(z.unknown()) }).passthrough().safeParse(item);
    if (!message.success) return [];
    return message.data.content.flatMap((part) => {
      const text = z.object({ type: z.literal("output_text"), text: z.string() }).passthrough().safeParse(part);
      return text.success ? [text.data.text] : [];
    });
  });
  if (texts.length !== 1) throw new Error("Intent compiler returned no structured result");
  return texts[0]!;
}

function parseCompilationText(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced?.[1] ?? trimmed);
}

export function createOpenAiIntentCompiler(options: Options) {
  const fetcher = options.fetcher ?? fetch;
  return { async compile(goal: string, actionPreference: ActionPreference): Promise<IntentCompilation> {
    if (actionPreference === "service-purchase") return {
      status: "clarification", question: "Tag one supported service from the @ menu.",
    };
    const normalizedGoal = goal.replace(/@(?=[A-Za-z0-9])/g, "");
    const rwaTarget = requestedRwaTarget(goal);
    const clearRoundTrip = requestedRoundTripAsset(normalizedGoal);
    if (clearRoundTrip && !/\b(?:at least|minimum|profit)\b/i.test(normalizedGoal)) {
      const amount = requestedInputAmount({ goal: normalizedGoal,
        symbol: clearRoundTrip.symbol, decimals: clearRoundTrip.decimals,
        balances: options.walletBalances });
      if (!amount) return { status: "clarification",
        question: `Your ${clearRoundTrip.symbol} wallet balance is zero. Fund it or enter an exact amount.` };
      return { status: "review", values: {
        templateId: "round-trip", inputToken: clearRoundTrip.address,
        outputToken: clearRoundTrip.address, amount,
        minimum: formatAtomicAmount(1n, clearRoundTrip.decimals),
        minimumSource: "round-trip-default", maxSolverFeeUsd: "0",
        jurisdiction: "", eligibilityAccepted: false,
      } };
    }
    const clearRwaInput = rwaTarget && requestedRwaInput(normalizedGoal);
    const explicitRwaMinimum = rwaTarget && new RegExp(
      `\\d+(?:\\.\\d+)?\\s*@?${rwaTarget.symbol}(?=$|[^A-Za-z0-9])`, "i",
    ).test(normalizedGoal);
    if (rwaTarget && clearRwaInput && !explicitRwaMinimum) {
      const amount = requestedInputAmount({ goal: normalizedGoal,
        symbol: clearRwaInput.symbol, decimals: clearRwaInput.decimals,
        balances: options.walletBalances });
      const minimum = amount && deriveMarketMinimum({ amount,
        inputDecimals: clearRwaInput.decimals,
        inputPriceUsd: options.assetPricesUsd?.[clearRwaInput.symbol] ?? "",
        outputDecimals: rwaTarget.decimals,
        outputPriceUsd: options.assetPricesUsd?.[rwaTarget.symbol] ?? "" });
      if (!amount) return { status: "clarification",
        question: `Your ${clearRwaInput.symbol} wallet balance is zero. Fund it or enter an exact amount.` };
      if (!minimum) return { status: "clarification",
        question: "A fresh price is unavailable for one of the requested assets." };
      return { status: "review", values: { templateId: "rwa-acquisition",
        inputToken: rwaTarget.instrument.chainId === 1
          ? clearRwaInput.address.toLowerCase() as typeof clearRwaInput.address
          : clearRwaInput.address,
        outputToken: rwaTarget.address,
        amount, minimum, minimumSource: "market-default", maxSolverFeeUsd: "0",
        jurisdiction: "", eligibilityAccepted: false } };
    }
    const registeredComposition = actionPreference === "any"
      ? resolveRegisteredCompositionGoal(normalizedGoal) : undefined;
    if (registeredComposition) {
      return options.compositionAvailable
        ? { status: "review", values: registeredComposition }
        : { status: "clarification", question: "No compatible multi-step solver is active yet." };
    }
    const templates = actionPreference === "any" && rwaTarget
      ? ["rwa-acquisition" as const]
      : actionPreference === "any" ? TemplateSchema.options : [actionPreference];
    const walletAssets = options.walletAssets ?? INTENT_ASSETS;
    const inputSymbols = [...new Set([
      "OKB", ...walletAssets.map(({ symbol }) => symbol), ...Object.keys(options.walletBalances ?? {}),
    ])];
    const response = await fetcher("https://openrouter.ai/api/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json" },
      body: JSON.stringify({ model: options.model, store: false, max_output_tokens: 500,
        reasoning: { effort: "none" },
        instructions: INTENT_COMPILER_INSTRUCTIONS,
        input: JSON.stringify({ goal: normalizedGoal, templates,
        xLayerAssets: CONVERSION_INTENT_ASSETS.map(({ symbol }) => symbol),
        walletAssets: inputSymbols.map((symbol) => ({ symbol,
          balance: options.walletBalances?.[symbol] ?? null,
          priceUsd: options.assetPricesUsd?.[symbol] ?? null })),
        registeredCompositionCapabilities: [...COMPOSITION_CAPABILITY_IDS],
        templateContracts: INTENT_TEMPLATE_CONTRACTS,
        crossChainAssets: RWA_INTENT_ASSETS.map(({ symbol, instrument }) => ({
          symbol, chainId: instrument.chainId,
        })) }),
        text: { format: { type: "json_schema", name: "cobia_intent_receipt", strict: true,
          schema: schema() } } }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Intent compiler request failed (${response.status})`);
    const compiled = CompilationSchema.parse(parseCompilationText(outputText(await response.json())));
    const roundTrip = requestedRoundTripAsset(normalizedGoal);
    if (roundTrip) {
      const amount = requestedInputAmount({ goal: normalizedGoal,
        symbol: roundTrip.symbol, decimals: roundTrip.decimals,
        compiled: { amount: compiled.amount }, balances: options.walletBalances });
      if (!amount) return { status: "clarification",
        question: `Your ${roundTrip.symbol} wallet balance is zero. Fund it or enter an exact amount.` };
      const explicitMinimum = compiled.templateId === "round-trip" ? compiled.minimum : "";
      const minimum = decimalToAtomic(explicitMinimum, roundTrip.decimals)
        ? explicitMinimum : formatAtomicAmount(1n, roundTrip.decimals);
      return { status: "review", values: resolveSimpleReceipt({
        templateId: "round-trip", inputSymbol: roundTrip.symbol,
        outputSymbol: roundTrip.symbol, amount, minimum,
        jurisdiction: compiled.jurisdiction },
      explicitMinimum ? undefined : "round-trip-default") };
    }
    if (!rwaTarget && compiled.status === "clarification") {
      if (compiled.question) return { status: "clarification", question: compiled.question };
      throw new Error("Intent compiler omitted its clarification question");
    }
    const rwaInput = rwaTarget && requestedRwaInput(normalizedGoal);
    let boundedCompilation = rwaTarget
      ? { ...compiled, status: "review" as const, question: null, kind: "simple" as const,
        templateId: "rwa-acquisition" as const, outputSymbol: rwaTarget.symbol,
        inputSymbol: rwaInput?.symbol ?? compiled.inputSymbol }
      : compiled;
    let minimumSource: IntentReceiptValues["minimumSource"];
    if (rwaTarget && rwaInput) {
      const amount = requestedInputAmount({ goal: normalizedGoal,
        symbol: rwaInput.symbol, decimals: rwaInput.decimals,
        compiled: { amount: compiled.amount }, balances: options.walletBalances });
      if (!amount) return { status: "clarification",
        question: `Your ${rwaInput.symbol} wallet balance is zero. Fund it or enter an exact amount.` };
      boundedCompilation = { ...boundedCompilation, amount };
    }
    if (rwaTarget && boundedCompilation.kind === "simple" && !boundedCompilation.minimum) {
      const input = [NATIVE_INTENT_ASSET, ...INTENT_ASSETS].find(({ symbol }) =>
        symbol.toLowerCase() === boundedCompilation.inputSymbol.toLowerCase());
      const minimum = input && deriveMarketMinimum({
        amount: boundedCompilation.amount, inputDecimals: input.decimals,
        inputPriceUsd: options.assetPricesUsd?.[input.symbol] ?? "",
        outputDecimals: rwaTarget.decimals,
        outputPriceUsd: options.assetPricesUsd?.[rwaTarget.symbol] ?? "",
      });
      if (!minimum) return { status: "clarification",
        question: "A fresh price is unavailable for one of the requested assets." };
      boundedCompilation = { ...boundedCompilation, minimum };
      minimumSource = "market-default";
    }
    if (boundedCompilation.kind === "conversion") {
      if (actionPreference !== "any") return { status: "clarification",
        question: "Select Any action to compile a wallet conversion." };
      if (!compiled.conversion) throw new Error("Intent compiler omitted conversion policy fields");
      const conversion = ConversionModelDraftSchema.parse(compiled.conversion);
      const exactInputs = preserveExactTaggedWalletInputs(goal, conversion.outputSymbol,
        conversion.inputs, walletAssets);
      if (!exactInputs) {
        return { status: "clarification",
          question: "The draft did not preserve the exact wallet token tagged in your goal. Edit the token tag and try again." };
      }
      const resolved = resolveConversionDraft({ ...conversion, inputs: exactInputs }, options.assetPricesUsd,
        options.walletBalances, walletAssets);
      if ("kind" in resolved && resolved.kind === "clarification") {
        return { status: "clarification", question: resolved.question };
      }
      if ("kind" in resolved) return { status: "review", values: resolved };
      return { status: "review", values: resolved };
    }
    if (boundedCompilation.kind === "composed") {
      if (actionPreference !== "any") return { status: "clarification",
        question: "Select Any action to let registered capabilities compose." };
      if (!options.compositionAvailable) return { status: "clarification",
        question: "No compatible multi-step solver is active yet." };
      if (!compiled.composed) throw new Error("Intent compiler omitted composed policy fields");
      return { status: "review", values: resolveCompositionDraft(compiled.composed) };
    }
    if (actionPreference !== "any" && boundedCompilation.templateId !== actionPreference) {
      return { status: "clarification",
        question: "Adjust the goal so it matches the selected action type." };
    }
    return { status: "review",
      values: resolveSimpleReceipt(boundedCompilation, minimumSource) };
  } };
}
