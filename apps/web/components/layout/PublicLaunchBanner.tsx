"use client";

import { CheckCircle2, Clock3, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";

interface AccessStatus {
  state: "allowlist" | "scheduled" | "live" | "paused";
  activationAt: number;
}

function countdown(seconds: number): string {
  if (seconds <= 0) return "Activation ready";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor(seconds % 86_400 / 3_600);
  const minutes = Math.floor(seconds % 3_600 / 60);
  const remainder = seconds % 60;
  return [days && `${days}d`, (days || hours) && `${hours}h`, `${minutes}m`, `${remainder}s`]
    .filter(Boolean).join(" ");
}

export function PublicLaunchBanner() {
  const [status, setStatus] = useState<AccessStatus>();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1_000));

  useEffect(() => {
    let active = true;
    const read = () => fetch("/api/network/status", { cache: "no-store" })
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
    const tick = window.setInterval(() => setNow(Math.floor(Date.now() / 1_000)), 1_000);
    return () => window.clearInterval(tick);
  }, []);

  if (!status || status.state === "allowlist") return null;
  if (status.state === "live") return (
    <div className="public-launch public-launch--live" role="status">
      <CheckCircle2 aria-hidden="true" size={16} strokeWidth={1.8} />
      <span>Public execution is live on X Layer</span>
    </div>
  );
  if (status.state === "paused") return (
    <div className="public-launch public-launch--paused" role="status">
      <ShieldAlert aria-hidden="true" size={16} strokeWidth={1.8} />
      <span>Public execution is temporarily paused</span>
    </div>
  );
  const remaining = Math.max(0, status.activationAt - now);
  return (
    <div className="public-launch" role="status">
      <Clock3 aria-hidden="true" size={16} strokeWidth={1.8} />
      {remaining > 0 ? <span>Mainnet launch ready in <strong>{countdown(remaining)}</strong></span>
        : <span><strong>Mainnet launch ready</strong> · governance action pending</span>}
    </div>
  );
}
