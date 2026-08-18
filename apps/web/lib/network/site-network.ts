export type SiteNetworkMode = "mainnet" | "testnet";
export type SiteChainId = 196 | 1952;

export interface SiteNetwork {
  mode: SiteNetworkMode;
  chainId: SiteChainId;
  name: "X Layer Mainnet" | "X Layer Testnet";
  shortName: "X Layer" | "Testnet";
  productionExecution: boolean;
}

const MAINNET: SiteNetwork = {
  mode: "mainnet",
  chainId: 196,
  name: "X Layer Mainnet",
  shortName: "X Layer",
  productionExecution: true,
};

const TESTNET: SiteNetwork = {
  mode: "testnet",
  chainId: 1952,
  name: "X Layer Testnet",
  shortName: "Testnet",
  productionExecution: false,
};

const MAINNET_HOSTS = new Set(["getcobia.com", "www.getcobia.com", "cobia-web.vercel.app"]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function normalizeHost(value: string): string {
  const first = value.split(",", 1)[0]?.trim().toLowerCase() ?? "";
  if (first.startsWith("[")) return first.slice(1, first.indexOf("]"));
  return first.split(":", 1)[0] ?? "";
}

export function resolveSiteNetwork(
  rawHost: string,
  environment: { VERCEL_URL?: string; VERCEL_PROJECT_PRODUCTION_URL?: string } = {
    VERCEL_URL: process.env.VERCEL_URL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  },
): SiteNetwork {
  const host = normalizeHost(rawHost);
  if (host === "testnet.getcobia.com" || host === "testnet.localhost") return TESTNET;
  const configuredVercelHosts = [environment.VERCEL_URL, environment.VERCEL_PROJECT_PRODUCTION_URL]
    .filter((value): value is string => Boolean(value))
    .map(normalizeHost);
  if (MAINNET_HOSTS.has(host) || LOCAL_HOSTS.has(host) || configuredVercelHosts.includes(host)) {
    return MAINNET;
  }
  throw new Error(`Unrecognized Cobia host: ${host || "(missing)"}`);
}

export function resolveRequestNetwork(request: Request): SiteNetwork {
  const host = request.headers.get("host") ?? new URL(request.url).host;
  return resolveSiteNetwork(host);
}

const TESTNET_PAGE_PATHS = new Set(["/", "/portfolio", "/terms"]);

export function networkAllowsPath(mode: SiteNetworkMode, pathname: string): boolean {
  if (mode === "mainnet") return true;
  if (TESTNET_PAGE_PATHS.has(pathname) || pathname === "/api/network/status" || pathname.startsWith("/_vercel/")) return true;
  return /^\/api\/wallets\/0x[0-9a-f]{40}\/portfolio$/i.test(pathname);
}
