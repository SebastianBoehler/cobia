"use client";

import { Check, CircleAlert, Copy, Share2 } from "lucide-react";
import { useMemo, useState } from "react";
import styles from "./ShareProofActions.module.css";

interface ShareProofActionsProps {
  requestId: string;
  summary: string;
  publicOrigin?: string;
}

const DEFAULT_PUBLIC_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3000";

export function ShareProofActions({ requestId, summary, publicOrigin }: ShareProofActionsProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const origin = new URL(publicOrigin ?? DEFAULT_PUBLIC_ORIGIN).origin;
  const proofUrl = `${origin}/requests/${requestId}`;
  const shareUrl = useMemo(() => {
    const params = new URLSearchParams({
      text: `X Layer DeFi proof: ${summary}. Solver route, signed bounds, and public verification via Cobia.`,
      url: proofUrl,
    });
    return `https://x.com/intent/post?${params.toString()}`;
  }, [proofUrl, summary]);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(proofUrl);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
    window.setTimeout(() => setCopyState("idle"), 1_500);
  }

  return (
    <div className={styles.actions} aria-label="Share public route proof">
      <a className={styles.action} href={shareUrl} target="_blank" rel="noreferrer">
        <Share2 aria-hidden="true" size={15} /> Share proof on X
      </a>
      <button className={styles.action} type="button" onClick={() => void copy()} aria-live="polite">
        {copyState === "copied" ? <Check aria-hidden="true" size={15} />
          : copyState === "error" ? <CircleAlert aria-hidden="true" size={15} />
            : <Copy aria-hidden="true" size={15} />}
        {copyState === "copied" ? "Copied"
          : copyState === "error" ? "Copy failed" : "Copy public proof link"}
      </button>
    </div>
  );
}
