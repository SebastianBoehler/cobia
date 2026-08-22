"use client";

import {
  CommerceOfferV1Schema, commerceOfferCommitmentV1, commitment, type CommerceOfferV1,
} from "@cobia/domain";
import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { keccak256, stringToHex } from "viem";
import {
  DEFAULT_INTENT_RECEIPT_VALUES, decimalToAtomic, INTENT_ASSETS,
  RWA_INTENT_ASSETS,
} from "../../lib/intents/capability-templates";
import type { IntentComposerDraft } from "../../lib/intents/challenge-draft";
import { type ActionPreference, type ProtocolExclusionId } from "../../lib/intents/intent-controls";
import { useWallet } from "../wallet/WalletProvider";
import { IntentGoalInput } from "./IntentGoalInput";
import { PolicyReceiptEditor, type ReceiptValues } from "./PolicyReceiptEditor";
import { CompositionPolicyEditor } from "./CompositionPolicyEditor";
import type { IntentMention } from "./IntentGoalInput";
import type { PortfolioSnapshot } from "../../lib/portfolio/read-portfolio";
import { authenticateIntentCompiler } from "../../lib/wallet-auth/client";
import { extractGoalMentions, useResolvedAssetMentions } from "./useResolvedAssetMentions";
import type { ComposedIntentDraft } from "../../lib/intents/composition-draft";
import { buildIntentComposerPolicy } from "../../lib/intents/build-composer-policy";
import type { StagedConversionDraft } from "../../lib/intents/staged-conversion-draft";
import { StagedConversionPolicyEditor } from "./StagedConversionPolicyEditor";
import type { AvailableIntentAsset } from "./IntentAvailableAssets";

type ComposerValues = ReceiptValues | ComposedIntentDraft | StagedConversionDraft;

function isComposed(values: ComposerValues): values is ComposedIntentDraft {
  return "kind" in values && values.kind === "composed";
}

function isStaged(values: ComposerValues): values is StagedConversionDraft {
  return "kind" in values && values.kind === "staged-conversion";
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "The intent could not be published.";
}

export function IntentComposer({ initialDraft, initialGoal = "" }: {
  initialDraft?: IntentComposerDraft;
  initialGoal?: string;
}) {
  const wallet = useWallet();
  const router = useRouter();
  const [goal, setGoal] = useState(initialDraft?.goal ?? initialGoal);
  const [values, setValues] = useState<ComposerValues>(
    initialDraft?.values ?? DEFAULT_INTENT_RECEIPT_VALUES,
  );
  const [step, setStep] = useState<"goal" | "review">(initialDraft ? "review" : "goal");
  const [action, setAction] = useState<ActionPreference>(initialDraft?.values.templateId ?? "any");
  const [excludedProtocols, setExcludedProtocols] = useState<ProtocolExclusionId[]>([]);
  const [portfolio, setPortfolio] = useState<{ key: string; snapshot: PortfolioSnapshot }>();
  const [portfolioState, setPortfolioState] = useState<{
    key: string; status: "loading" | "ready" | "error";
  }>();
  const [offers, setOffers] = useState<CommerceOfferV1[]>([]);
  const [assetPrices, setAssetPrices] = useState<Record<string, string | undefined>>({});
  const [mentionsLoaded, setMentionsLoaded] = useState<string>();
  const [compiling, setCompiling] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const composerContextKey = `${wallet.account ?? "disconnected"}:${wallet.targetChainId}`;
  const walletPortfolioKey = wallet.account && wallet.targetChainId === 196 ? composerContextKey : undefined;
  const activePortfolio = portfolio && portfolio.key === walletPortfolioKey ? portfolio.snapshot : undefined;
  const activePortfolioState = portfolioState && portfolioState.key === walletPortfolioKey
    ? portfolioState.status : "idle";
  const composed = isComposed(values);
  const staged = isStaged(values);
  const rwa = !composed && !staged && values.templateId === "rwa-acquisition";
  const inputAsset = !staged ? INTENT_ASSETS.find(({ address }) => address === values.inputToken) ?? INTENT_ASSETS[0]
      : INTENT_ASSETS[0];
  const outputAsset = rwa && !composed
    ? RWA_INTENT_ASSETS.find(({ address }) => address === (values as ReceiptValues).outputToken) ?? RWA_INTENT_ASSETS[0]
    : staged ? INTENT_ASSETS.find(({ address }) => address === values.outputToken) ?? INTENT_ASSETS[0]
    : !composed ? INTENT_ASSETS.find(({ address }) => address === values.outputToken) ?? INTENT_ASSETS[1]
      : INTENT_ASSETS[1];
  const amount = staged ? "" : values.amount;
  const inputAtomic = useMemo(() => decimalToAtomic(amount, inputAsset.decimals), [inputAsset.decimals, amount]);
  const minimum = composed ? "" : values.minimum;
  const minimumAtomic = useMemo(() => decimalToAtomic(minimum, outputAsset.decimals), [minimum, outputAsset.decimals]);
  const stagedInputsValid = staged && values.inputs.every((item) =>
    decimalToAtomic(item.amount, item.decimals));
  const valid = Boolean(wallet.account && goal.trim() && (
    staged ? stagedInputsValid && minimumAtomic : inputAtomic && (
      composed
        ? values.maxConversionLossBps >= 0 && values.maxConversionLossBps <= 500 &&
          values.minimumReceiptValueBps >= 9_500 && values.minimumReceiptValueBps <= 10_000 &&
          values.horizonDays >= 1 && values.horizonDays <= 365 &&
          values.competitionDurationSec >= 60 &&
          values.deadlineDurationSec >= values.competitionDurationSec
        : values.templateId === "aave-supply" || minimumAtomic
    )
  ));

  async function loadMentions() {
    if (mentionsLoaded === composerContextKey) return;
    setMentionsLoaded(composerContextKey);
    if (wallet.account && wallet.targetChainId === 196) {
      setPortfolioState({ key: composerContextKey, status: "loading" });
      fetch(`/api/wallets/${wallet.account}/portfolio?chainId=196`)
        .then(async (response) => {
          if (!response.ok) throw new Error("Portfolio read failed");
          return response.json() as Promise<PortfolioSnapshot>;
        })
        .then((snapshot) => {
          setPortfolio({ key: composerContextKey, snapshot });
          setPortfolioState({ key: composerContextKey, status: "ready" });
        }).catch(() => setPortfolioState({ key: composerContextKey, status: "error" }));
      fetch("/api/assets/resolve", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: ["OKB", ...INTENT_ASSETS.map(({ symbol }) => symbol)] }) })
        .then(async (response): Promise<{ assets: Array<{ symbol: string; priceUsd?: string }> }> =>
          response.ok ? response.json() : { assets: [] })
        .then(({ assets }) => setAssetPrices(Object.fromEntries(assets.map((asset) =>
          [asset.symbol.toLowerCase(), asset.priceUsd]))))
        .catch(() => undefined);
    }
    fetch("/api/commerce/discover?limit=12")
      .then(async (response): Promise<{ offers: unknown[] }> => response.ok
        ? response.json() as Promise<{ offers: unknown[] }> : { offers: [] })
      .then((result) => setOffers(result.offers.flatMap((offer) => {
        const parsed = CommerceOfferV1Schema.safeParse(offer);
        return parsed.success && parsed.data.eligibility.status === "executable" ? [parsed.data] : [];
      }))).catch(() => undefined);
  }

  const mentions = useMemo<IntentMention[]>(() => [
    ...INTENT_ASSETS.map(({ symbol, address }) => {
      const balance = activePortfolio?.balances?.find((item) => item.symbol === symbol);
      const walletBalance = balance
        ? `${Number(balance.formatted).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${symbol}`
        : undefined;
      return { id: `asset:${symbol}`, group: "Assets" as const, mention: symbol, address,
        priceUsd: balance?.priceUsd ?? assetPrices[symbol.toLowerCase()], walletBalance,
        detail: walletBalance ? `${walletBalance} available` : "X Layer asset" };
    }),
    ...(activePortfolio?.balances ?? []).filter(({ address }) => typeof address === "string" && !INTENT_ASSETS.some((asset) =>
      asset.address.toLowerCase() === address.toLowerCase())).map(({ symbol, address, formatted, priceUsd }) => ({
        id: `wallet-asset:${address}`, group: "Assets" as const, mention: symbol, address, priceUsd,
        walletBalance: `${Number(formatted).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${symbol}`,
        detail: `${Number(formatted).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${symbol} available`,
      })),
    ...RWA_INTENT_ASSETS.map(({ symbol, address, instrument }) => ({ id: `asset:${symbol}`, group: "Assets" as const,
      mention: symbol, address, priceUsd: assetPrices[symbol.toLowerCase()],
      detail: `Cross-chain asset · ${instrument.chainId === 196 ? "X Layer" : "Ethereum"}` })),
    { id: "network:x-layer", group: "Networks", mention: "XLayer", detail: "Chain 196" },
    { id: "network:ethereum", group: "Networks", mention: "Ethereum", detail: "Chain 1" },
    { id: "protocol:aave", group: "Protocols", mention: "Aave", detail: "Earn on X Layer" },
    { id: "protocol:curve", group: "Protocols", mention: "Curve", detail: "Swap on X Layer" },
    { id: "protocol:uniswap", group: "Protocols", mention: "Uniswap", detail: "Swap on X Layer" },
    ...offers.map((offer) => ({ id: `service:${commerceOfferCommitmentV1(offer)}`,
      group: "Services" as const,
      mention: `${offer.merchant.displayName}/${(offer.product.name ?? offer.product.id).replaceAll(" ", "-")}`,
      detail: `${offer.payment.atomicAmount} atomic · chain ${offer.payment.chainId}` })),
  ], [activePortfolio, assetPrices, offers]);
  const { assets: resolvedAssetMentions, unresolved: unresolvedAssetMentions } = useResolvedAssetMentions(goal, mentions);
  const availableAssets = useMemo<AvailableIntentAsset[]>(() => {
    if (!activePortfolio) return [];
    const balances = [
      ...(activePortfolio.native ? [{ symbol: activePortfolio.native.symbol, amountAtomic: activePortfolio.native.amountAtomic,
        amount: activePortfolio.native.formatted }] : []),
      ...(activePortfolio.balances ?? []).map((balance) => ({ symbol: balance.symbol, amountAtomic: balance.amountAtomic,
        amount: balance.formatted })),
    ];
    return balances.flatMap((balance) => {
      let positive = false;
      try { positive = BigInt(balance.amountAtomic) > 0n; } catch { return []; }
      if (!positive) return [];
      const priceUsd = "priceUsd" in balance && typeof balance.priceUsd === "string"
        ? balance.priceUsd : assetPrices[balance.symbol.toLowerCase()];
      return [{ symbol: balance.symbol, amount: balance.amount, priceUsd }];
    });
  }, [activePortfolio, assetPrices]);
  const allMentions = useMemo(() => [...mentions, ...resolvedAssetMentions], [mentions, resolvedAssetMentions]);
  const selectedMentions = useMemo(() => {
    const selected = allMentions.filter(({ mention }) => {
    const escaped = mention.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\s)@${escaped}(?=$|[\\s.,!?;:])`, "i").test(goal);
    });
    const resolved = new Set(selected.map(({ mention }) => mention.toLowerCase()));
    return [...selected, ...extractGoalMentions(goal).filter((mention) => !resolved.has(mention.toLowerCase()))
      .map((mention) => ({ id: `unresolved-asset:${mention.toLowerCase()}`, group: "Assets" as const,
        mention, detail: "Unresolved token · research only" }))];
  }, [allMentions, goal]);
  const selectedService = selectedMentions.find(({ group }) => group === "Services")
    ?.id.slice("service:".length);

  function mention(value: IntentMention) {
    const token = `@${value.mention}`;
    setGoal((current) => current.includes(token) ? current
      : `${current}${current && !current.endsWith(" ") ? " " : ""}${token} `);
    if (value.group === "Services") {
      setAction("service-purchase");
    }
  }

  function mentionSuggestion(value: IntentMention) {
    setGoal((current) => current.replace(/(^|\s)@[A-Za-z0-9.$_-]*$/, `$1@${value.mention} `));
    if (value.group === "Services") setAction("service-purchase");
  }

  async function compileGoal() {
    if (goal.trim().length < 3 || !wallet.account) return;
    if (action === "service-purchase") {
      if (selectedService) router.push(`/commerce/offers/${selectedService}`);
      else setError("Tag one Cobia-supported service from the @ menu.");
      return;
    }
    setCompiling(true);
    setError(undefined);
    try {
      const request = () => fetch("/api/intents/compile", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: wallet.account, goal: goal.trim(), actionPreference: action }) });
      let response = await request();
      if (response.status === 401) {
        await authenticateIntentCompiler({ owner: wallet.account, request: wallet.request });
        response = await request();
      }
      const payload = await response.json() as {
        status?: "review" | "clarification"; values?: ComposerValues; question?: string; message?: string;
      };
      if (!response.ok) throw new Error(payload.message ?? "The policy draft could not be compiled.");
      if (payload.status === "clarification") {
        setError(payload.question ?? "Add the missing spend and outcome bounds to your goal.");
        return;
      }
      if (payload.status !== "review" || !payload.values) {
        throw new Error("The policy compiler returned an incomplete draft.");
      }
      setValues(payload.values);
      setStep("review");
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setCompiling(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || !wallet.account) return;
    setPending(true);
    setError(undefined);
    try {
      await wallet.switchToXLayer();
      const requestId = crypto.randomUUID();
      const nowSec = Math.floor(Date.now() / 1_000);
      const nonce = keccak256(stringToHex(`${requestId}:${wallet.account}:${nowSec}:${crypto.randomUUID()}`));
      const policy = buildIntentComposerPolicy({ values, requestId, owner: wallet.account,
        inputAtomic, minimumAtomic, nonce, nowSec, displayGoal: goal.trim(), excludedProtocols });
      const ownerSignature = await wallet.request({
        method: "personal_sign",
        params: [commitment(policy), policy.owner],
      });
      if (typeof ownerSignature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(ownerSignature)) {
        throw new Error("The wallet returned an invalid intent signature.");
      }
      const response = await fetch("/api/intents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy, ownerSignature }),
      });
      const payload = await response.json() as { links?: { intent?: string }; message?: string };
      if (!response.ok || !payload.links?.intent) {
        throw new Error(payload.message ?? "The intent could not be published.");
      }
      router.push(payload.links.intent);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={`intent-composer intent-composer--${step}`} noValidate onSubmit={submit}>
      {step === "goal" ? <>
        <IntentGoalInput action={action} compiling={compiling}
          submitEnabled={Boolean(wallet.account)}
          excludedProtocols={excludedProtocols} mentions={allMentions}
          unresolvedMentions={unresolvedAssetMentions}
          availableAssets={availableAssets} portfolioState={activePortfolioState}
          value={goal} onActionChange={setAction} onChange={setGoal} onMention={mention}
          onMentionSuggestion={mentionSuggestion}
          onMentionMenuOpen={loadMentions}
          onExcludedProtocolsChange={setExcludedProtocols}
          onSubmit={compileGoal} />
        {error ? <p className="form-alert" role="alert">{error}</p> : null}
        {!wallet.account ? <p className="intent-connect-note">Connect a signing wallet to verify control before Cobia interprets the goal.</p> : null}
      </> : <>
        <div className="intent-goal-summary"><p>{goal}</p><button className="button button--secondary"
          onClick={() => { setStep("goal"); setError(undefined); }} type="button">
          <ArrowLeft aria-hidden="true" size={16} /> Edit goal
        </button></div>
        {composed
          ? <CompositionPolicyEditor owner={wallet.account} values={values} onChange={setValues} />
          : staged
            ? <StagedConversionPolicyEditor values={values} onChange={setValues} />
          : <PolicyReceiptEditor owner={wallet.account} values={values} onChange={setValues} />}
        {error ? <p className="form-alert" role="alert">{error}</p> : null}
        <button className="button button--primary intent-submit" disabled={!valid || pending} type="submit">
          {pending ? <LoaderCircle aria-hidden="true" className="spin" size={17} /> : null}
          {pending ? "Publishing intent…" : "Sign and publish intent"}
          {!pending ? <ArrowRight aria-hidden="true" size={17} /> : null}
        </button>
        {!wallet.account ? <p className="intent-connect-note">Connect your wallet in the header to bind the policy owner.</p> : null}
      </>}
    </form>
  );
}
