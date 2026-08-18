"use client";

import { ArrowRight, ChevronDown, LoaderCircle } from "lucide-react";
import { commitment } from "@cobia/domain";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { getAddress, keccak256, stringToHex } from "viem";
import { SUPPORTED_ASSETS } from "../../lib/chain/supported-assets";
import { ROUTE_POLICY_V2_DEFAULTS } from "../../lib/intents/route-policy-v2";
import { buildGeneralIntentPolicyV2 } from "../../lib/intents/general-policy";
import { shortAddress } from "../../lib/wallet/eip1193";
import { useWallet } from "../wallet/WalletProvider";
import { AssetMark } from "../brand/AssetMark";
import { IntentModeTabs, type IntentMode } from "../intents/IntentModeTabs";
import { CreatedRequestResult, type CreatedRequest } from "./CreatedRequestResult";
import {
  decimalToAtomic,
  formatPrincipal,
  intentOutcome,
  objectiveForMode,
  percentToBps,
} from "./intent-form-values";
import { PolicySummary } from "./PolicySummary";

export function PolicyForm() {
  const wallet = useWallet();
  const [mode, setMode] = useState<IntentMode>("Earn");
  const [assetAddress, setAssetAddress] = useState(SUPPORTED_ASSETS[0].address);
  const [principal, setPrincipal] = useState("10");
  const [exposure, setExposure] = useState("100");
  const [minimumProfit, setMinimumProfit] = useState("0.10");
  const [advanced, setAdvanced] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [created, setCreated] = useState<CreatedRequest>();
  const asset = SUPPORTED_ASSETS.find((item) => item.address === assetAddress) ?? SUPPORTED_ASSETS[0];
  const outputAsset = SUPPORTED_ASSETS.find((item) => item.address !== asset.address) ?? asset;

  const values = useMemo(() => {
    const principalAtomic = decimalToAtomic(principal, 6);
    const exposureBps = percentToBps(exposure);
    const minimumProfitBps = percentToBps(minimumProfit);
    return { principalAtomic, exposureBps, minimumProfitBps };
  }, [exposure, minimumProfit, principal]);

  const valid =
    wallet.account !== null &&
    values.principalAtomic !== null &&
    (mode === "Earn"
      ? values.exposureBps !== null && values.exposureBps > 0 &&
        values.exposureBps <= 10_000
      : mode === "Swap" || (values.minimumProfitBps !== null && values.minimumProfitBps > 0));
  const effectiveExposureBps = mode === "Earn" ? values.exposureBps : 10_000;
  const exposureAtomic = values.principalAtomic
    ? ((BigInt(values.principalAtomic) * BigInt(effectiveExposureBps ?? 0)) / 10_000n).toString()
    : null;
  const objective = values.principalAtomic ? objectiveForMode({
    mode,
    principalAtomic: values.principalAtomic,
    outputAsset: outputAsset.address,
    maxSlippageBps: ROUTE_POLICY_V2_DEFAULTS.maxSlippageBps,
    minimumProfitBps: values.minimumProfitBps ?? 0,
  }) : undefined;
  const receiptMetrics = mode === "Earn" ? [
    { label: "Principal", value: formatPrincipal(values.principalAtomic, asset.displaySymbol) },
    { label: "Protocol exposure", value: `${formatPrincipal(exposureAtomic, asset.displaySymbol)} exact` },
    { label: "Minimum receipt", value: `${formatPrincipal(exposureAtomic ? (BigInt(exposureAtomic) * 9_950n / 10_000n).toString() : null, `a${asset.displaySymbol}`)}` },
  ] : mode === "Swap" && objective?.kind === "swap" ? [
    { label: "You send", value: formatPrincipal(values.principalAtomic, asset.displaySymbol) },
    { label: "You receive", value: outputAsset.displaySymbol },
    { label: "Minimum received", value: formatPrincipal(objective.minimumOutputAtomic, outputAsset.displaySymbol) },
    { label: "Maximum slippage", value: `${(ROUTE_POLICY_V2_DEFAULTS.maxSlippageBps / 100).toFixed(2)}%` },
  ] : objective?.kind === "profit" ? [
    { label: "Round-trip asset", value: asset.displaySymbol },
    { label: "You send", value: formatPrincipal(values.principalAtomic, asset.displaySymbol) },
    { label: "Minimum final balance", value: formatPrincipal(objective.minimumFinalAtomic, asset.displaySymbol) },
    { label: "Minimum profit", value: `${minimumProfit}%` },
  ] : [];

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!valid) return;
    setPending(true);
    setError(undefined);
    try {
      if (!wallet.account) throw new Error("Connect an EVM wallet to sign this intent.");
      const { principalAtomic, minimumProfitBps } = values;
      if (
        !principalAtomic || effectiveExposureBps === null ||
        (mode === "Profit" && minimumProfitBps === null)
      ) throw new Error("The route policy fields are invalid.");
      await wallet.switchToXLayer();
      const requestId = crypto.randomUUID();
      // This runs only after submit; the signed policy needs fresh authority and replay protection.
      // eslint-disable-next-line react-hooks/purity
      const nowSec = Math.floor(Date.now() / 1_000);
      const nonce = keccak256(stringToHex(`${requestId}:${wallet.account}:${nowSec}:${crypto.randomUUID()}`));
      const common = {
        requestId, owner: wallet.account, inputToken: asset.address,
        inputAtomic: principalAtomic, nonce, nowSec,
        displayGoal: intentOutcome(mode, principal, asset.displaySymbol, outputAsset.displaySymbol),
        competitionDurationSec: 300,
      } as const;
      const policy = mode === "Earn"
        ? buildGeneralIntentPolicyV2({ ...common, templateId: "aave-supply", exposureBps: effectiveExposureBps })
        : mode === "Swap" && objective?.kind === "swap"
          ? buildGeneralIntentPolicyV2({
              ...common, templateId: "exact-input-swap", outputToken: objective.outputAsset,
              minimumOutputAtomic: objective.minimumOutputAtomic,
            })
          : mode === "Profit" && objective?.kind === "profit"
            ? buildGeneralIntentPolicyV2({
                ...common, templateId: "round-trip",
                minimumProfitAtomic: (BigInt(objective.minimumFinalAtomic) - BigInt(principalAtomic)).toString(),
              })
            : (() => { throw new Error("The general intent objective is invalid."); })();
      const ownerSignature = await wallet.request({
        method: "personal_sign",
        params: [commitment(policy), policy.owner],
      });
      if (typeof ownerSignature !== "string") throw new Error("Wallet returned an invalid signature.");
      const response = await fetch("/api/general-intents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy, ownerSignature }),
      });
      const payload = (await response.json()) as Partial<CreatedRequest> & {
        message?: string;
      };
      if (
        !response.ok || !payload.requestId || !payload.policyHash ||
        (!payload.agentProgramId &&
          (!Number.isInteger(payload.quoteCount) || !Number.isInteger(payload.failureCount)))
      ) {
        throw new Error(payload.message ?? "The solver market could not be completed.");
      }
      setCreated(payload as CreatedRequest);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The solver market could not be completed.");
    } finally {
      setPending(false);
    }
  }

  if (created) {
    return <CreatedRequestResult created={created} />;
  }

  return (
    <form className="policy-form" onSubmit={submit} noValidate>
      <IntentModeTabs mode={mode} onChange={setMode} />
      <div className="intent-summary">
        <span>Your intent</span>
        <p>{intentOutcome(mode, principal, asset.displaySymbol, outputAsset.displaySymbol)}</p>
      </div>
      <div className="wallet-identity">
        <span>Funding wallet</span>
        <strong>{wallet.account ? shortAddress(getAddress(wallet.account)) : "Connect wallet above"}</strong>
      </div>

      <div className="field-grid">
        <div className="field">
          <label htmlFor="asset">Asset</label>
          <div className="asset-select">
            <AssetMark asset={asset.displaySymbol} size={28} />
            <select id="asset" value={asset.address} onChange={(event) => setAssetAddress(getAddress(event.target.value))}>
              {SUPPORTED_ASSETS.map((item) => <option value={item.address} key={item.address}>{item.displaySymbol}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="principal">Amount</label>
          <div className="input-affix">
            <input
              id="principal"
              inputMode="decimal"
              value={principal}
              onChange={(event) => setPrincipal(event.target.value)}
            />
            <span>{asset.displaySymbol}</span>
          </div>
        </div>
      </div>

      <button
        className="limits-toggle"
        type="button"
        aria-expanded={advanced}
        onClick={() => setAdvanced((value) => !value)}
      >
        Advanced settings
        <ChevronDown aria-hidden="true" className={advanced ? "is-open" : ""} size={17} />
      </button>

      {advanced ? (
        <div className="limits-panel">
          {mode === "Earn" ? <div className="field-grid">
            <div className="field field--wide">
              <label htmlFor="exposure">Protocol exposure</label>
              <div className="input-affix">
                <input
                  id="exposure"
                  inputMode="decimal"
                  value={exposure}
                  onChange={(event) => setExposure(event.target.value)}
                />
                <span>% exact</span>
              </div>
            </div>
            <div className="field">
              <label>Onchain minimum</label>
              <p className="field-note">At least 99.5% of the allocated amount must arrive as the registered Aave receipt token.</p>
            </div>
          </div> : mode === "Profit" ? (
            <div className="field-grid">
              <div className="field">
                <label htmlFor="profit">Minimum final profit</label>
                <div className="input-affix">
                  <input
                    id="profit"
                    value={minimumProfit}
                    onChange={(event) => setMinimumProfit(event.target.value)}
                  />
                  <span>%</span>
                </div>
              </div>
            </div>
          ) : null}
          <PolicySummary
            metrics={receiptMetrics}
            outputAssets={SUPPORTED_ASSETS.map(({ displaySymbol }) => displaySymbol).join(" and ")}
            adapters="Current beta manifest: Aave V3 supply and Curve or Uniswap V3 swaps"
            maximumSlippage={`${(ROUTE_POLICY_V2_DEFAULTS.maxSlippageBps / 100).toFixed(2)}%`}
            horizon={mode === "Earn" ? `${ROUTE_POLICY_V2_DEFAULTS.horizonDays} days` : undefined}
            snapshotAge={`${ROUTE_POLICY_V2_DEFAULTS.maxSnapshotAgeSec} seconds`}
            intentLifetime={`${ROUTE_POLICY_V2_DEFAULTS.deadlineLifetimeSec / 60} minutes`}
          />
        </div>
      ) : null}

      {error ? <p role="alert" className="form-alert">{error}</p> : null}
      <button className="button button--primary button--wide" type="submit" disabled={!valid || pending}>
        {pending ? <LoaderCircle className="spin" aria-hidden="true" size={17} /> : null}
        {pending ? "Running isolated coding agent…" : "Build verified program"}
        {!pending ? <ArrowRight aria-hidden="true" size={17} /> : null}
      </button>
      <p className="terms-notice">
        By finding routes, you accept the <Link href="/terms">Terms</Link>. APY and LP fees are
        estimates, not guarantees. Token forecasts are estimates. No funds move until a separate
        wallet confirmation.
      </p>
      <p className="payment-note">
        No funds move until your wallet confirms the verified mainnet calls. Mainnet beta currently
        accepts only the allowlisted canary wallet.
      </p>
    </form>
  );
}
