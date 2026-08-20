import { createPublicClient, http, isAddressEqual, type Address } from "viem";
import { quoteCurveStableSwapNg } from "../../../apps/web/lib/adapters/curve-reader";
import { createProtocolReadClient, type BlockReference } from
  "../../../apps/web/lib/adapters/read-client";
import { PROTOCOL_REGISTRY, type RegistryAsset } from
  "../../../apps/web/lib/adapters/registry";
import { quoteUniswapExactInputSingle } from
  "../../../apps/web/lib/adapters/uniswap-reader";
import { xLayer } from "../../../apps/web/lib/chain/xlayer";

export type SwapProtocol = "curve" | "uniswap";
export interface SwapRouteQuote {
  protocol: SwapProtocol;
  amountInAtomic: bigint;
  amountOutAtomic: bigint;
}
export interface RoundTripQuote {
  first: SwapRouteQuote;
  second: SwapRouteQuote;
}

const BPS = 10_000n;
const SLIPPAGE_BPS = 50n;

export function conservativeOutput(value: bigint) {
  return value * (BPS - SLIPPAGE_BPS) / BPS;
}

export function selectDirectRoute(routes: readonly SwapRouteQuote[], minimumOutput: bigint) {
  return routes.filter((route) => conservativeOutput(route.amountOutAtomic) >= minimumOutput)
    .sort((left, right) => left.amountOutAtomic === right.amountOutAtomic ?
      left.protocol.localeCompare(right.protocol) : left.amountOutAtomic > right.amountOutAtomic ? -1 : 1)[0];
}

export function selectRoundTripRoute(
  routes: readonly RoundTripQuote[],
  principal: bigint,
  minimumIncrease: bigint,
) {
  const minimumFinal = principal + minimumIncrease;
  return routes.filter(({ second }) => second.amountOutAtomic >= minimumFinal)
    .sort((left, right) => left.second.amountOutAtomic === right.second.amountOutAtomic ?
      `${left.first.protocol}:${left.second.protocol}`.localeCompare(
        `${right.first.protocol}:${right.second.protocol}`,
      ) : left.second.amountOutAtomic > right.second.amountOutAtomic ? -1 : 1)[0];
}

function asset(address: Address): RegistryAsset | undefined {
  return Object.entries(PROTOCOL_REGISTRY.aaveV3.assets).find(([, value]) =>
    isAddressEqual(value.underlying.address, address))?.[0] as RegistryAsset | undefined;
}

function otherAsset(value: RegistryAsset): RegistryAsset {
  const result = (Object.keys(PROTOCOL_REGISTRY.aaveV3.assets) as RegistryAsset[])
    .find((candidate) => candidate !== value);
  if (!result) throw new Error("Reference swap registry has no counter asset");
  return result;
}

async function quote(
  read: ReturnType<typeof createProtocolReadClient>,
  protocol: SwapProtocol,
  tokenIn: RegistryAsset,
  tokenOut: RegistryAsset,
  amountInAtomic: bigint,
  block: BlockReference,
): Promise<SwapRouteQuote> {
  const result = protocol === "curve"
    ? await quoteCurveStableSwapNg(read, { tokenIn, tokenOut, amountInAtomic, block })
    : await quoteUniswapExactInputSingle(read, { tokenIn, tokenOut, amountInAtomic, block });
  return { protocol, amountInAtomic, amountOutAtomic: result.amountOutAtomic };
}

async function available<T>(jobs: Promise<T>[]): Promise<T[]> {
  return (await Promise.allSettled(jobs)).flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : []);
}

function capability(protocol: SwapProtocol) {
  return protocol === "curve"
    ? "curve-stableswap-ng.exact-input"
    : "uniswap-v3.exact-input";
}

function action(route: SwapRouteQuote, tokenIn: Address, tokenOut: Address, minimum: bigint) {
  return {
    capabilityId: capability(route.protocol),
    capabilityVersion: 1 as const,
    valueAtomic: "0",
    parameters: {
      tokenIn,
      tokenOut,
      amountInAtomic: route.amountInAtomic.toString(),
      minimumOutputAtomic: minimum.toString(),
    },
  };
}

export async function buildSwapActions(input: {
  rpcUrl: string;
  block: BlockReference;
  inputToken: Address;
  outputToken: Address;
  inputAtomic: bigint;
  minimumOutputAtomic: bigint;
}) {
  const client = createPublicClient({ chain: xLayer, transport: http(input.rpcUrl) });
  const read = createProtocolReadClient(client);
  const tokenIn = asset(input.inputToken);
  if (!tokenIn) return undefined;
  const protocols = ["curve", "uniswap"] as const;
  if (!isAddressEqual(input.inputToken, input.outputToken)) {
    const tokenOut = asset(input.outputToken);
    if (!tokenOut) return undefined;
    const routes = await available(protocols.map((protocol) =>
      quote(read, protocol, tokenIn, tokenOut, input.inputAtomic, input.block)));
    const selected = selectDirectRoute(routes, input.minimumOutputAtomic);
    return selected ? [action(selected, input.inputToken, input.outputToken,
      input.minimumOutputAtomic > conservativeOutput(selected.amountOutAtomic)
        ? input.minimumOutputAtomic : conservativeOutput(selected.amountOutAtomic))] : undefined;
  }
  const counter = otherAsset(tokenIn);
  const counterAddress = PROTOCOL_REGISTRY.aaveV3.assets[counter].underlying.address;
  const firstRoutes = await available(protocols.map((protocol) =>
    quote(read, protocol, tokenIn, counter, input.inputAtomic, input.block)));
  const roundTrips: RoundTripQuote[] = [];
  for (const first of firstRoutes) {
    const secondInput = conservativeOutput(first.amountOutAtomic);
    const secondRoutes = await available(protocols.map((protocol) =>
      quote(read, protocol, counter, tokenIn, secondInput, input.block)));
    roundTrips.push(...secondRoutes.map((second) => ({ first: {
      ...first, amountOutAtomic: first.amountOutAtomic,
    }, second })));
  }
  const selected = selectRoundTripRoute(
    roundTrips,
    input.inputAtomic,
    input.minimumOutputAtomic,
  );
  if (!selected) return undefined;
  return [
    action(selected.first, input.inputToken, counterAddress,
      conservativeOutput(selected.first.amountOutAtomic)),
    action(selected.second, counterAddress, input.outputToken,
      input.inputAtomic + input.minimumOutputAtomic),
  ];
}
