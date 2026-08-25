"use client";

import { useEffect, useMemo, useState } from "react";
import type { IntentMention } from "./IntentGoalInput";

interface ResolvedAsset {
  symbol: string;
  name: string;
  chainId: 1 | 196;
  address: string;
  status: "supported" | "registered" | "catalog-backed" | "research-only";
  priceUsd?: string;
  liquidityUsd?: string;
  holderCount?: string;
}

interface SuggestionState {
  key: string;
  assets: ResolvedAsset[];
}

export type AssetResolutionStatus = "idle" | "checking" | "ready" | "error";

interface ResolutionState {
  key: string;
  status: Exclude<AssetResolutionStatus, "idle">;
  assets: ResolvedAsset[];
  unresolved: string[];
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
): { assets: IntentMention[]; unresolved: string[]; status: AssetResolutionStatus } {
  const [resolution, setResolution] = useState<ResolutionState>();
  const [suggestions, setSuggestions] = useState<SuggestionState>();
  const unknown = useMemo(() => {
    const known = new Set(knownMentions.map(({ mention }) => mention.toLowerCase()));
    return extractGoalMentions(goal).filter((mention) => !known.has(mention.toLowerCase())).slice(0, 8);
  }, [goal, knownMentions]);
  const key = unknown.map((mention) => mention.toLowerCase()).join("|");
  const suggestionQuery = useMemo(() => {
    const match = goal.match(/(?:^|\s)@([A-Za-z0-9.$_-]+)$/);
    return match?.[1] ?? "";
  }, [goal]);

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch("/api/assets/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: unknown }),
        signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok) throw new Error("Asset resolution failed");
        return response.json() as Promise<{ assets?: ResolvedAsset[]; unresolved?: string[] }>;
      })
        .then((result) => {
          if (!Array.isArray(result.assets) || !Array.isArray(result.unresolved)) {
            throw new Error("Asset resolution payload is invalid");
          }
          setResolution({ key, status: "ready", assets: result.assets, unresolved: result.unresolved });
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setResolution({ key, status: "error", assets: [], unresolved: unknown });
          }
        });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [key, unknown]);

  useEffect(() => {
    if (!suggestionQuery) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch("/api/assets/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: suggestionQuery }),
        signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok) throw new Error("Asset suggestions failed");
        return response.json() as Promise<{ assets?: ResolvedAsset[] }>;
      }).then((result) => {
        if (!Array.isArray(result.assets)) throw new Error("Asset suggestions payload is invalid");
        setSuggestions({ key: suggestionQuery.toLowerCase(), assets: result.assets });
      }).catch(() => undefined);
    }, 175);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [suggestionQuery]);

  const active = new Set(unknown.map((mention) => mention.toLowerCase()));
  const current = resolution?.key === key ? resolution : undefined;
  const currentSuggestions = suggestions?.key === suggestionQuery.toLowerCase() ? suggestions.assets : [];
  const candidates = [...(current?.assets ?? []).filter((asset) => active.has(asset.symbol.toLowerCase())),
    ...currentSuggestions];
  const normalized = new Map<string, ResolvedAsset>();
  for (const asset of candidates) normalized.set(`${asset.chainId}:${asset.address.toLowerCase()}`, asset);
  return {
    assets: [...normalized.values()].map((asset) => ({
      id: `resolved-asset:${asset.chainId}:${asset.address}`,
      group: "Assets",
      mention: asset.symbol,
      chainId: asset.chainId,
      address: asset.address,
      priceUsd: asset.priceUsd,
      detail: asset.status === "research-only"
        ? `${asset.name} · ${shortAddress(asset.address)} · research only`
        : asset.status === "catalog-backed"
          ? `${asset.name} · ${shortAddress(asset.address)} · xStocks catalog`
        : `${asset.name} · ${asset.chainId === 196 ? "X Layer" : "Ethereum"}`,
    })),
    unresolved: (current?.unresolved ?? []).filter((mention) => active.has(mention.toLowerCase())),
    status: !key ? "idle" : current?.status ?? "checking",
  };
}
