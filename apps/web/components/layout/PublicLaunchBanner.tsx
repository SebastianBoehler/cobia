"use client";

import { CheckCircle2, Clock3, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import type { GeneralAssetLaunchStatus } from "../../lib/network/general-asset-launch-status";

interface AccessStatus {
  state: "allowlist" | "scheduled" | "live" | "paused";
  activationAt: number;
  v4?: GeneralAssetLaunchStatus;
}

function countdown(seconds: number): string {
  if (seconds <= 0) return "Activation ready";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor(seconds % 86_400 / 3_600);
  const minutes = Math.floor(seconds % 3_600 / 60);
  return [days && `${days}d`, (days || hours) && `${hours}h`, `${minutes}m`]
    .filter(Boolean).join(" ");
}

export function PublicLaunchBanner() {
  const [status, setStatus] = useState<AccessStatus>();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1_000));

  useEffect(() => {
    let active = true;
    const read = () => fetch("/api/network/status")
      .then(async (response) => {
        if (!response.ok) throw new Error("Public access status unavailable");
        return await response.json() as AccessStatus;
      })
      .then((next) => { if (active) setStatus(next); })
      .catch(() => undefined);
    void read();
    const poll = window.setInterval(read, 30_000);
    return () => { active = false; window.clearInterval(poll); };
  }, []);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Math.floor(Date.now() / 1_000)), 60_000);
    return () => window.clearInterval(tick);
  }, []);

  if (!status || status.state === "allowlist") return null;
  if (status.state === "live") {
    const v4 = status.v4;
    if (v4?.state === "live") return (
      <div className="public-launch public-launch--live" role="status">
        <CheckCircle2 aria-hidden="true" size={16} strokeWidth={1.8} />
        <span><strong>V4 + xStocks live</strong> · Verified TSLAx acquisition and standard ERC-20 swaps on X Layer</span>
      </div>
    );
    const remaining = v4 ? Math.max(0, v4.activationAt - now) : 0;
    const next = v4?.state === "canary-scheduled"
      ? remaining > 0
        ? <>V4 canary in {countdown(remaining)} · verified ERC-20 swaps next</>
        : <>V4 canary activation ready</>
      : v4?.state === "canary-live"
        ? <>V4 canary live · public proposal pending</>
        : v4?.state === "public-scheduled"
          ? remaining > 0 ? <>V4 public access in {countdown(remaining)}</> : <>V4 public activation ready</>
          : v4?.state === "preparing" ? <>V4 preparation in progress</> : null;
    return (
    <div className="public-launch public-launch--live" role="status">
      <CheckCircle2 aria-hidden="true" size={16} strokeWidth={1.8} />
      <span><strong>Live now</strong> · USDG/USDt0 swaps and Aave on X Layer</span>
      {next ? <>{" "}<span className="public-launch__next">{next}</span></> : null}
    </div>
  );
  }
  if (status.state === "paused") return (
    <div className="public-launch public-launch--paused" role="status">
      <ShieldAlert aria-hidden="true" size={16} strokeWidth={1.8} />
      <span>Mainnet execution paused</span>
    </div>
  );
  const remaining = Math.max(0, status.activationAt - now);
  return (
    <div className="public-launch" role="status">
      <Clock3 aria-hidden="true" size={16} strokeWidth={1.8} />
      {remaining > 0
        ? <span><strong>Mainnet launch ready</strong> · Public access opens in {countdown(remaining)}</span>
        : <span><strong>Mainnet launch ready</strong> · Governance activation pending</span>}
    </div>
  );
}
