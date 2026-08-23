import { TransactionStageV1Schema, commitment } from "@cobia/domain";
import { ProviderArtifactV1Schema, RawWalletArtifactV1Schema } from "@cobia/solvers";
import {
  encodeFunctionData,
  isAddressEqual,
  keccak256,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { PROTOCOL_REGISTRY } from "../../../apps/web/lib/adapters/registry";

export const CURVE_LIQUIDITY_ABI = parseAbi([
  "function add_liquidity(uint256[] amounts,uint256 minimumMint,address receiver) returns (uint256)",
  "function remove_liquidity_one_coin(uint256 burnAmount,int128 coinIndex,uint256 minimumReceived,address receiver) returns (uint256)",
]);

const pool = PROTOCOL_REGISTRY.curveStableSwapNg.pair.pool.address.toLowerCase() as Address;
const coins = [
  PROTOCOL_REGISTRY.aaveV3.assets[PROTOCOL_REGISTRY.curveStableSwapNg.pair.token0]
    .underlying.address,
  PROTOCOL_REGISTRY.aaveV3.assets[PROTOCOL_REGISTRY.curveStableSwapNg.pair.token1]
    .underlying.address,
] as const;

function coinIndex(token: Address) {
  const index = coins.findIndex((candidate) => isAddressEqual(candidate, token));
  if (index < 0) throw new Error("Curve liquidity requires a registered coin");
  return index;
}

function build(input: {
  stageId: string; owner: Address; inputToken: Address; inputAtomic: string;
  outputToken: Address; minimumOutputAtomic: string; data: Hex;
  approval?: { token: Address; spender: Address; maximumAtomic: string };
  fetchedAt: number; expiresAt: number; operation: string;
}) {
  if (input.expiresAt <= input.fetchedAt) throw new Error("Curve liquidity expiry is invalid");
  const owner = input.owner.toLowerCase() as Address;
  const request = { chainId: 196, operation: input.operation, owner,
    inputToken: input.inputToken, inputAtomic: input.inputAtomic,
    outputToken: input.outputToken, minimumOutputAtomic: input.minimumOutputAtomic };
  const response = { target: pool, dataHash: keccak256(input.data), valueAtomic: "0" };
  const stage = TransactionStageV1Schema.parse({
    id: input.stageId, kind: "wallet-transaction", chainId: 196, dependsOn: [],
    provider: "evm.raw@1", quoteHash: commitment(request), responseHash: commitment(response),
    fetchedAt: input.fetchedAt, expiresAt: input.expiresAt, sender: owner, recipient: owner,
    input: { token: input.inputToken, atomic: input.inputAtomic },
    output: { chainId: 196, token: input.outputToken,
      minimumAtomic: input.minimumOutputAtomic },
    ...(input.approval ? { approval: input.approval } : {}),
    transaction: { target: pool, selector: input.data.slice(0, 10),
      dataHash: keccak256(input.data), valueAtomic: "0" },
    tools: [`curve-stableswap-ng.${input.operation}`],
  });
  const payload = RawWalletArtifactV1Schema.parse({ version: 1, provider: "evm.raw@1",
    stageId: stage.id, transaction: { chainId: 196, from: owner, to: pool,
      data: input.data, valueAtomic: "0" } });
  const artifact = ProviderArtifactV1Schema.parse({ stageId: stage.id,
    provider: "evm.raw@1", payloadHash: commitment(payload), payload });
  return { stage, artifact, payload };
}

export function buildCurveAddLiquidityStage(input: {
  stageId: string; owner: Address; inputToken: Address; inputAtomic: string;
  minimumLpAtomic: string; fetchedAt: number; expiresAt: number;
}) {
  const index = coinIndex(input.inputToken);
  const amounts = [0n, 0n];
  amounts[index] = BigInt(input.inputAtomic);
  const token = coins[index]!.toLowerCase() as Address;
  const data = encodeFunctionData({ abi: CURVE_LIQUIDITY_ABI,
    functionName: "add_liquidity",
    args: [amounts, BigInt(input.minimumLpAtomic), input.owner] });
  return build({ ...input, inputToken: token, outputToken: pool,
    minimumOutputAtomic: input.minimumLpAtomic, data,
    approval: { token, spender: pool, maximumAtomic: input.inputAtomic }, operation: "add-liquidity" });
}

export function buildCurveRemoveOneCoinStage(input: {
  stageId: string; owner: Address; outputToken: Address; lpAtomic: string;
  minimumOutputAtomic: string; fetchedAt: number; expiresAt: number;
}) {
  const index = coinIndex(input.outputToken);
  const token = coins[index]!.toLowerCase() as Address;
  const data = encodeFunctionData({ abi: CURVE_LIQUIDITY_ABI,
    functionName: "remove_liquidity_one_coin",
    args: [BigInt(input.lpAtomic), BigInt(index), BigInt(input.minimumOutputAtomic), input.owner] });
  return build({ ...input, inputToken: pool, inputAtomic: input.lpAtomic,
    outputToken: token, data, operation: "remove-one-coin" });
}

export const XLAYER_CURVE_LP_TOKEN = pool;
