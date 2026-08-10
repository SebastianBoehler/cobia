"use client";

import { ArrowRight, ChevronDown, CircleCheck, LoaderCircle } from "lucide-react";
import { commitment, StablecoinPolicySchema } from "@cobia/domain";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { getAddress } from "viem";
import { SUPPORTED_ASSETS } from "../../lib/chain/supported-assets";
import { shortAddress } from "../../lib/wallet/eip1193";
import { useWallet } from "../wallet/WalletProvider";
import { PolicySummary } from "./PolicySummary";

interface CreatedRequest {
  requestId: string;
  policyHash: string;
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
  const [assetAddress, setAssetAddress] = useState(SUPPORTED_ASSETS[0].address);
  const [principal, setPrincipal] = useState("25000");
  const [exposure, setExposure] = useState("40");
  const [minimumTvl, setMinimumTvl] = useState("500000");
  const [minimumApy, setMinimumApy] = useState("0.05");
  const [acknowledged, setAcknowledged] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [created, setCreated] = useState<CreatedRequest>();
  const asset = SUPPORTED_ASSETS.find((item) => item.address === assetAddress) ?? SUPPORTED_ASSETS[0];

  const values = useMemo(() => {
    const principalAtomic = decimalToAtomic(principal, 6);
    const exposureBps = percentToBps(exposure);
    const minTvlUsdE6 = decimalToAtomic(minimumTvl, 6);
    const minNetApyBps = percentToBps(minimumApy);
    return { principalAtomic, exposureBps, minTvlUsdE6, minNetApyBps };
  }, [exposure, minimumApy, minimumTvl, principal]);

  const valid =
    wallet.account !== null &&
    values.principalAtomic !== null &&
    values.exposureBps !== null &&
    values.exposureBps > 0 &&
    values.minTvlUsdE6 !== null &&
    values.minNetApyBps !== null &&
    acknowledged;
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
      await wallet.switchToXLayer();
      const policy = StablecoinPolicySchema.parse({
        version: 1,
        requestId: crypto.randomUUID(),
        owner: wallet.account,
        executionChainId: 196,
        asset: asset.address,
        principalAtomic: values.principalAtomic,
        maxProtocolExposureBps: values.exposureBps,
        minTvlUsdE6: values.minTvlUsdE6,
        minNetApyBps: values.minNetApyBps,
        maxSnapshotAgeSec: 300,
        // This runs only after submit; the signed policy needs a fresh wall-clock deadline.
        // eslint-disable-next-line react-hooks/purity
        deadline: Math.floor(Date.now() / 1_000) + 1_800,
        noBridges: true,
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
      if (!response.ok || !payload.requestId || !payload.policyHash) {
        throw new Error(payload.message ?? "The quote market could not be opened.");
      }
      setCreated({ requestId: payload.requestId, policyHash: payload.policyHash });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The quote market could not be opened.");
    } finally {
      setPending(false);
    }
  }

  if (created) {
    return (
      <section className="request-created" aria-live="polite">
        <CircleCheck aria-hidden="true" size={26} />
        <div>
          <h2>Quote market opened</h2>
          <p>Solvers can now compete. Your principal has not moved.</p>
        </div>
        <code>{created.policyHash}</code>
        <Link className="button button--primary" href={`/requests/${created.requestId}`}>
          Watch competition <ArrowRight aria-hidden="true" size={17} />
        </Link>
      </section>
    );
  }

  return (
    <form className="policy-form" onSubmit={submit} noValidate>
      <div className="wallet-identity">
        <span>Wallet</span>
        <strong>{wallet.account ? shortAddress(getAddress(wallet.account)) : "Connect wallet above"}</strong>
      </div>

      <div className="field-grid">
        <div className="field">
          <label htmlFor="asset">Asset</label>
          <select id="asset" value={asset.address} onChange={(event) => setAssetAddress(getAddress(event.target.value))}>
            {SUPPORTED_ASSETS.map((item) => <option value={item.address} key={item.address}>{item.displaySymbol}</option>)}
          </select>
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
        <div className="field-grid limits-panel">
          <div className="field field--wide">
            <label htmlFor="exposure">Protocol exposure</label>
            <div className="input-affix">
              <input
                id="exposure"
                inputMode="decimal"
                value={exposure}
                onChange={(event) => setExposure(event.target.value)}
              />
              <span>% max</span>
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
            <label htmlFor="apy">Minimum net APY</label>
            <div className="input-affix">
              <input id="apy" value={minimumApy} onChange={(event) => setMinimumApy(event.target.value)} />
              <span>%</span>
            </div>
          </div>
        </div>
      ) : null}

      <PolicySummary
        principal={formatPrincipal(values.principalAtomic, asset.displaySymbol)}
        exposure={`${formatPrincipal(exposureAtomic, asset.displaySymbol)} max`}
        minimumTvl={`$${Number(minimumTvl).toLocaleString("en-US")}`}
        minimumApy={`${minimumApy}%`}
      />

      <label className="acknowledgement">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
        />
        <span>
          I understand this is machine-generated research and execution can lose value.
        </span>
      </label>

      {error ? <p role="alert" className="form-alert">{error}</p> : null}
      <button className="button button--primary button--wide" type="submit" disabled={!valid || pending}>
        {pending ? <LoaderCircle className="spin" aria-hidden="true" size={17} /> : null}
        {pending ? "Opening market…" : "Open quote market"}
        {!pending ? <ArrowRight aria-hidden="true" size={17} /> : null}
      </button>
      <p className="payment-note">Free request · 0.10 reveal · 0.09 winner · 0.01 Cobia</p>
    </form>
  );
}
