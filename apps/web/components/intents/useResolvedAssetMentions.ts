"use client";

import { useEffect, useMemo, useState } from "react";
import type { IntentMention } from "./IntentGoalInput";

interface ResolvedAsset {
  symbol: string;
  name: string;
  chainId: 1 | 196;
  address: string;
  status: "supported" | "registered" | "research-only";
  priceUsd?: string;
  liquidityUsd?: string;
  holderCount?: string;
}

export function extractGoalMentions(goal: string): string[] {
  return [...new Map([...goal.matchAll(/@([A-Za-z0-9]+(?:[./-][A-Za-z0-9]+)*)/g)]
    .map((match) => [match[1]!.toLowerCase(), match[1]!])).values()];
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function useResolvedAssetMentions(
  goal: string,
  knownMentions: readonly IntentMention[],
): IntentMention[] {
  const [assets, setAssets] = useState<ResolvedAsset[]>([]);
  const unknown = useMemo(() => {
    const known = new Set(knownMentions.map(({ mention }) => mention.toLowerCase()));
    return extractGoalMentions(goal).filter((mention) => !known.has(mention.toLowerCase())).slice(0, 8);
  }, [goal, knownMentions]);
  const key = unknown.map((mention) => mention.toLowerCase()).join("|");

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch("/api/assets/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: unknown }),
        signal: controller.signal,
      }).then(async (response) => response.ok
        ? response.json() as Promise<{ assets: ResolvedAsset[] }> : { assets: [] })
        .then((result) => setAssets(result.assets))
        .catch(() => { if (!controller.signal.aborted) setAssets([]); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [key, unknown]);

  const active = new Set(unknown.map((mention) => mention.toLowerCase()));
  return assets.filter((asset) => active.has(asset.symbol.toLowerCase())).map((asset) => ({
    id: `resolved-asset:${asset.chainId}:${asset.address}`,
    group: "Assets",
    mention: asset.symbol,
    detail: asset.status === "research-only"
      ? `${asset.name}${asset.priceUsd ? ` · $${asset.priceUsd}` : ""} · ${shortAddress(asset.address)} · research only`
      : `${asset.name} · ${asset.chainId === 196 ? "X Layer" : "Ethereum"}`,
  }));
}
