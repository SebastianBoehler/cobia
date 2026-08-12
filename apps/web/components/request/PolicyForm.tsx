"use client";

import { ArrowRight, ChevronDown, CircleCheck, LoaderCircle } from "lucide-react";
import { commitment } from "@cobia/domain";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { getAddress } from "viem";
import { SUPPORTED_ASSETS } from "../../lib/chain/supported-assets";
import {
  buildRoutePolicyV2,
  ROUTE_POLICY_V2_DEFAULTS,
} from "../../lib/intents/route-policy-v2";
import { shortAddress } from "../../lib/wallet/eip1193";
import { useWallet } from "../wallet/WalletProvider";
import { AssetMark } from "../brand/AssetMark";
import { IntentModeTabs, type IntentMode } from "../intents/IntentModeTabs";
import { PolicySummary } from "./PolicySummary";

interface CreatedRequest {
  requestId: string;
  policyHash: string;
  quoteCount: number;
  failureCount: number;
}

function decimalToAtomic(value: string, decimals: number): string | null {
  const match = value.trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!match || (match[2]?.length ?? 0) > decimals) return null;
  const whole = BigInt(match[1]);
  const fraction = (match[2] ?? "").padEnd(decimals, "0");
  const result = whole * 10n ** BigInt(decimals) + BigInt(fraction || "0");
  return result > 0n ? result.toString() : null;
}

function percentToBps(value: string): number | null {
  const atomic = decimalToAtomic(value, 2);
  if (!atomic) return null;
  const bps = Number(atomic);
  return Number.isSafeInteger(bps) && bps <= 10_000 ? bps : null;
}

function formatPrincipal(atomic: string | null, symbol: string): string {
  if (!atomic) return "—";
  return `${(Number(atomic) / 1_000_000).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${symbol}`;
}

export function PolicyForm() {
  const wallet = useWallet();
  const [mode, setMode] = useState<IntentMode>("Earn");
  const [assetAddress, setAssetAddress] = useState(SUPPORTED_ASSETS[0].address);
  const [principal, setPrincipal] = useState("10");
  const [exposure, setExposure] = useState("100");
  const [minimumTvl, setMinimumTvl] = useState("500000");
  const [minimumApy, setMinimumApy] = useState("0.05");
  const [advanced, setAdvanced] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [created, setCreated] = useState<CreatedRequest>();
  const asset = SUPPORTED_ASSETS.find((item) => item.address === assetAddress) ?? SUPPORTED_ASSETS[0];

  const values = useMemo(() => {
    const principalAtomic = decimalToAtomic(principal, 6);
    const exposureBps = percentToBps(exposure);
    const minTvlUsdE6 = decimalToAtomic(minimumTvl, 6);
    const minPreGasApyBps = percentToBps(minimumApy);
    return { principalAtomic, exposureBps, minTvlUsdE6, minPreGasApyBps };
  }, [exposure, minimumApy, minimumTvl, principal]);

  const valid =
    mode === "Earn" &&
    wallet.account !== null &&
    values.principalAtomic !== null &&
    values.exposureBps !== null &&
    values.exposureBps > 0 &&
    values.minTvlUsdE6 !== null &&
    values.minPreGasApyBps !== null;
  const exposureAtomic = values.principalAtomic
    ? ((BigInt(values.principalAtomic) * BigInt(values.exposureBps ?? 0)) / 10_000n).toString()
    : null;

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!valid) return;
    setPending(true);
    setError(undefined);
    try {
      if (!wallet.account) throw new Error("Connect an EVM wallet to sign this intent.");
      const {
        principalAtomic,
        exposureBps,
        minTvlUsdE6,
        minPreGasApyBps,
      } = values;
      if (
        !principalAtomic || exposureBps === null ||
        !minTvlUsdE6 || minPreGasApyBps === null
      ) throw new Error("The route policy fields are invalid.");
      await wallet.switchToXLayer();
      const policy = buildRoutePolicyV2({
        requestId: crypto.randomUUID(),
        owner: wallet.account,
        asset: asset.address,
        principalAtomic,
        protocolExposureBps: exposureBps,
        minTvlUsdE6,
        minPreGasApyBps,
        // This runs only after submit; the signed policy needs a fresh wall-clock deadline.
        // eslint-disable-next-line react-hooks/purity
        nowSec: Math.floor(Date.now() / 1_000),
      });
      const ownerSignature = await wallet.request({
        method: "personal_sign",
        params: [commitment(policy), policy.owner],
      });
      if (typeof ownerSignature !== "string") throw new Error("Wallet returned an invalid signature.");
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy, ownerSignature }),
      });
      const payload = (await response.json()) as Partial<CreatedRequest> & {
        message?: string;
      };
      if (
        !response.ok || !payload.requestId || !payload.policyHash ||
        !Number.isInteger(payload.quoteCount) || !Number.isInteger(payload.failureCount)
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
    const hasAuthorizedRoute = created.quoteCount > 0;
    const quoteLabel = `${created.quoteCount} route-authorized quote${
      created.quoteCount === 1 ? " is" : "s are"
    } ready.`;
    const failureLabel = created.failureCount === 0
      ? "No solver produced a route-authorized quote."
      : `${created.failureCount} solver attempt${created.failureCount === 1 ? "" : "s"} failed or ${
        created.failureCount === 1 ? "was" : "were"
      } rejected.`;
    return (
      <section className="request-created" aria-live="polite">
        <CircleCheck aria-hidden="true" size={26} />
        <div>
          <h2>{hasAuthorizedRoute
            ? "Solver market complete"
            : "Request completed without an authorized route"}</h2>
          {hasAuthorizedRoute ? <>
            <p>{quoteLabel}</p>
            {created.failureCount > 0 ? <p>{failureLabel}</p> : null}
            <p>Your principal has not moved.</p>
          </> : <p>{failureLabel}</p>}
        </div>
        <code>{created.policyHash}</code>
        <Link className="button button--primary" href={`/requests/${created.requestId}`}>
          {hasAuthorizedRoute ? "Review solver quotes" : "Review request"} <ArrowRight aria-hidden="true" size={17} />
        </Link>
      </section>
    );
  }

  return (
    <form className="policy-form" onSubmit={submit} noValidate>
      <IntentModeTabs mode={mode} onChange={setMode} />
      <div className="intent-summary">
        <span>Your intent</span>
        <p>{mode === "Earn"
          ? `Earn the best verified return on ${principal || "—"} ${asset.displaySymbol} within your bounds.`
          : `${mode} intent parameters will be signed only after the atomic ${mode.toLowerCase()} policy is enabled.`}</p>
      </div>
      {mode !== "Earn" ? (
        <p className="mode-notice" role="status">
          Atomic {mode} intents are not enabled yet. Cobia will not submit this as an Earn intent.
        </p>
      ) : null}
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
          <div className="field-grid">
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
              <label htmlFor="tvl">Minimum protocol TVL</label>
              <div className="input-affix">
                <span>$</span>
                <input id="tvl" value={minimumTvl} onChange={(event) => setMinimumTvl(event.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="apy">Minimum estimated pre-gas APY</label>
              <div className="input-affix">
                <input id="apy" value={minimumApy} onChange={(event) => setMinimumApy(event.target.value)} />
                <span>%</span>
              </div>
            </div>
          </div>
          <PolicySummary
            principal={formatPrincipal(values.principalAtomic, asset.displaySymbol)}
            exposure={`${formatPrincipal(exposureAtomic, asset.displaySymbol)} exact`}
            minimumTvl={`$${Number(minimumTvl).toLocaleString("en-US")}`}
            minimumPreGasApy={`${minimumApy}%`}
            outputAssets={SUPPORTED_ASSETS.map(({ displaySymbol }) => displaySymbol).join(" and ")}
            adapters="Aave V3 supply, Curve and Uniswap V3 swaps, and full-range LP"
            maximumSlippage={`${(ROUTE_POLICY_V2_DEFAULTS.maxSlippageBps / 100).toFixed(2)}%`}
            horizon={`${ROUTE_POLICY_V2_DEFAULTS.horizonDays} days`}
            snapshotAge={`${ROUTE_POLICY_V2_DEFAULTS.maxSnapshotAgeSec} seconds`}
            intentLifetime={`${ROUTE_POLICY_V2_DEFAULTS.deadlineLifetimeSec / 60} minutes`}
          />
        </div>
      ) : null}

      {error ? <p role="alert" className="form-alert">{error}</p> : null}
      <button className="button button--primary button--wide" type="submit" disabled={!valid || pending}>
        {pending ? <LoaderCircle className="spin" aria-hidden="true" size={17} /> : null}
        {pending ? "Searching verified routes…" : "Find verified routes"}
        {!pending ? <ArrowRight aria-hidden="true" size={17} /> : null}
      </button>
      <p className="terms-notice">
        By finding routes, you accept the <Link href="/terms">Terms</Link>. APY and LP fees are estimates,
        not guarantees. No funds move until a separate wallet confirmation.
      </p>
      <p className="payment-note">Free request · Pay only after selecting an authorized quote</p>
    </form>
  );
}
