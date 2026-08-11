import { isAddressEqual, type Address } from "viem";
import {
  AAVE_ADDRESSES_PROVIDER_ABI,
  AAVE_DATA_PROVIDER_ABI,
  A_TOKEN_ABI,
  ERC20_BALANCE_ABI,
} from "./abis";
import { calculatePendingTreasury, rayDivFloor, rayMulFloor } from "./aave-math";
import {
  assertChainId,
  assertPinnedBlock,
  assertRuntimeCode,
  expectAddress,
  expectBigInt,
  expectBoolean,
  expectNumber,
  expectTuple,
  type BlockReference,
  type ProtocolReadClient,
} from "./read-client";
import { PROTOCOL_REGISTRY, registryHash, type RegistryAsset } from "./registry";
import { ProtocolIneligibleError } from "./protocol-error";

export interface AaveReserveState {
  adapterId: "aave-v3@1";
  registryHash: typeof registryHash;
  blockNumber: bigint;
  blockHash: BlockReference["hash"];
  blockTimestamp: bigint;
  asset: Address;
  aToken: Address;
  decimals: number;
  ltvBps: bigint;
  liquidationThresholdBps: bigint;
  liquidationBonusBps: bigint;
  reserveFactorBps: bigint;
  collateralEnabled: boolean;
  borrowingEnabled: boolean;
  borrowCapWholeTokens: bigint;
  supplyCapWholeTokens: bigint;
  supplyHeadroomAtomic: bigint | null;
  totalATokenAtomic: bigint;
  availableLiquidityAtomic: bigint;
  scaledTotalSupply: bigint;
  scaledSupplyAmount: bigint;
  validatedSupplyAtomic: bigint;
  accruedToTreasuryScaled: bigint;
  pendingTreasuryAtomic: bigint;
  nextLiquidityIndexRay: bigint;
  capUsageAfterAtomic: bigint;
  totalStableDebtAtomic: bigint;
  totalVariableDebtAtomic: bigint;
  liquidityRateRay: bigint;
}

function sameAddress(actual: Address, expected: Address, label: string) {
  if (!isAddressEqual(actual, expected)) throw new Error(`${label} identity mismatch`);
}

function read(
  client: ProtocolReadClient,
  address: Address,
  abi: Parameters<ProtocolReadClient["readContract"]>[0]["abi"],
  functionName: string,
  blockNumber: bigint,
  args?: readonly unknown[],
) {
  return client.readContract({ address, abi, functionName, args, blockNumber });
}

export async function readAaveReserve(
  client: ProtocolReadClient,
  input: { asset: RegistryAsset; amountAtomic: bigint; block: BlockReference },
): Promise<AaveReserveState> {
  if (input.amountAtomic <= 0n) throw new Error("Aave supply amount must be positive");
  const registry = PROTOCOL_REGISTRY.aaveV3;
  const asset = registry.assets[input.asset];
  if (!asset) throw new Error("Aave asset is not registered");
  const provider = registry.addressesProvider.address;
  const pool = registry.pool.address;
  const dataProvider = registry.dataProvider.address;
  const underlying = asset.underlying.address;
  const aToken = asset.aToken.address;
  const block = input.block;

  await assertChainId(client, PROTOCOL_REGISTRY.chainId);
  await assertPinnedBlock(client, block);
  await Promise.all([
    assertRuntimeCode(client, registry.addressesProvider, "Aave addresses provider", block.number),
    assertRuntimeCode(client, registry.pool, "Aave pool", block.number),
    assertRuntimeCode(client, registry.dataProvider, "Aave data provider", block.number),
    assertRuntimeCode(client, asset.underlying, `${input.asset} underlying`, block.number),
    assertRuntimeCode(client, asset.aToken, `${input.asset} aToken`, block.number),
  ]);

  const [providerPool, providerDataProvider, ownerProvider, ownedPool, tokensRaw,
    configurationRaw, capsRaw, pausedRaw, reserveRaw, aTokenPool, aTokenUnderlying,
    scaledTotalSupplyRaw, availableLiquidityRaw] = await Promise.all([
    read(client, provider, AAVE_ADDRESSES_PROVIDER_ABI, "getPool", block.number),
    read(client, provider, AAVE_ADDRESSES_PROVIDER_ABI, "getPoolDataProvider", block.number),
    read(client, dataProvider, AAVE_DATA_PROVIDER_ABI, "ADDRESSES_PROVIDER", block.number),
    read(client, dataProvider, AAVE_DATA_PROVIDER_ABI, "POOL", block.number),
    read(client, dataProvider, AAVE_DATA_PROVIDER_ABI, "getReserveTokensAddresses", block.number, [underlying]),
    read(client, dataProvider, AAVE_DATA_PROVIDER_ABI, "getReserveConfigurationData", block.number, [underlying]),
    read(client, dataProvider, AAVE_DATA_PROVIDER_ABI, "getReserveCaps", block.number, [underlying]),
    read(client, dataProvider, AAVE_DATA_PROVIDER_ABI, "getPaused", block.number, [underlying]),
    read(client, dataProvider, AAVE_DATA_PROVIDER_ABI, "getReserveData", block.number, [underlying]),
    read(client, aToken, A_TOKEN_ABI, "POOL", block.number),
    read(client, aToken, A_TOKEN_ABI, "UNDERLYING_ASSET_ADDRESS", block.number),
    read(client, aToken, A_TOKEN_ABI, "scaledTotalSupply", block.number),
    read(client, underlying, ERC20_BALANCE_ABI, "balanceOf", block.number, [aToken]),
  ]);

  sameAddress(expectAddress(providerPool, "Aave provider pool"), pool, "Aave provider pool");
  sameAddress(expectAddress(providerDataProvider, "Aave provider data provider"), dataProvider, "Aave provider data provider");
  sameAddress(expectAddress(ownerProvider, "Aave data provider owner"), provider, "Aave data provider owner");
  sameAddress(expectAddress(ownedPool, "Aave data provider pool"), pool, "Aave data provider pool");
  sameAddress(expectAddress(aTokenPool, "Aave aToken pool"), pool, "Aave aToken pool");
  sameAddress(expectAddress(aTokenUnderlying, "Aave aToken underlying"), underlying, "Aave aToken underlying");

  const tokens = expectTuple(tokensRaw, 3, "Aave reserve tokens");
  const readAToken = expectAddress(tokens[0], "Aave reserve aToken");
  sameAddress(readAToken, aToken, "Aave reserve aToken");
  expectAddress(tokens[1], "Aave stable debt token");
  expectAddress(tokens[2], "Aave variable debt token");

  const configuration = expectTuple(configurationRaw, 10, "Aave reserve configuration");
  const decimals = Number(expectBigInt(configuration[0], "Aave decimals"));
  if (decimals !== asset.decimals) throw new Error("Aave reserve decimals identity mismatch");
  const ltvBps = expectBigInt(configuration[1], "Aave LTV");
  const liquidationThresholdBps = expectBigInt(configuration[2], "Aave liquidation threshold");
  const liquidationBonusBps = expectBigInt(configuration[3], "Aave liquidation bonus");
  const reserveFactorBps = expectBigInt(configuration[4], "Aave reserve factor");
  const collateralEnabled = expectBoolean(configuration[5], "Aave collateral flag");
  const borrowingEnabled = expectBoolean(configuration[6], "Aave borrowing flag");
  const active = expectBoolean(configuration[8], "Aave active flag");
  const frozen = expectBoolean(configuration[9], "Aave frozen flag");
  const paused = expectBoolean(pausedRaw, "Aave paused flag");

  const caps = expectTuple(capsRaw, 2, "Aave reserve caps");
  const borrowCap = expectBigInt(caps[0], "Aave borrow cap");
  const supplyCap = expectBigInt(caps[1], "Aave supply cap");
  const reserve = expectTuple(reserveRaw, 12, "Aave reserve data");
  const accruedToTreasuryScaled = expectBigInt(reserve[1], "Aave accrued treasury");
  const totalAToken = expectBigInt(reserve[2], "Aave total aToken");
  const totalStableDebt = expectBigInt(reserve[3], "Aave total stable debt");
  const totalVariableDebt = expectBigInt(reserve[4], "Aave total variable debt");
  const liquidityRateRay = expectBigInt(reserve[5], "Aave liquidity rate");
  const currentLiquidityIndexRay = expectBigInt(reserve[9], "Aave liquidity index");
  const lastUpdateTimestamp = BigInt(expectNumber(reserve[11], "Aave last update timestamp"));
  const treasury = calculatePendingTreasury({
    accruedToTreasuryScaled,
    liquidityRateRay,
    currentLiquidityIndexRay,
    lastUpdateTimestamp,
    blockTimestamp: block.timestamp,
  });
  const scaledTotalSupply = expectBigInt(scaledTotalSupplyRaw, "Aave scaled total supply");
  const availableLiquidityAtomic = expectBigInt(
    availableLiquidityRaw,
    "Aave available liquidity",
  );
  const scaledSupplyAmount = rayDivFloor(input.amountAtomic, treasury.nextLiquidityIndexRay);
  if (rayMulFloor(scaledTotalSupply, treasury.nextLiquidityIndexRay) !== totalAToken) {
    throw new Error("Aave scaled total supply does not match total aToken supply");
  }
  const supplyCapAtomic = supplyCap * 10n ** BigInt(decimals);
  const currentCapUsageAtomic = rayMulFloor(
    scaledTotalSupply + accruedToTreasuryScaled,
    treasury.nextLiquidityIndexRay,
  );
  const capUsageAfterAtomic = rayMulFloor(
    scaledTotalSupply + scaledSupplyAmount + accruedToTreasuryScaled,
    treasury.nextLiquidityIndexRay,
  );
  const supplyCapExceeded = supplyCap > 0n && capUsageAfterAtomic > supplyCapAtomic;
  await assertPinnedBlock(client, block);

  if (!active) {
    throw new ProtocolIneligibleError("aave-reserve-inactive", "Aave reserve is inactive");
  }
  if (frozen) {
    throw new ProtocolIneligibleError("aave-reserve-frozen", "Aave reserve is frozen");
  }
  if (paused) {
    throw new ProtocolIneligibleError("aave-reserve-paused", "Aave reserve is paused");
  }
  if (scaledSupplyAmount === 0n) {
    throw new ProtocolIneligibleError(
      "aave-zero-scaled-amount",
      "Aave scaled supply amount is zero",
    );
  }
  if (supplyCapExceeded) {
    throw new ProtocolIneligibleError(
      "aave-supply-cap-exceeded",
      "Aave supply cap has insufficient headroom",
    );
  }

  return {
    adapterId: registry.adapterId,
    registryHash,
    blockNumber: block.number,
    blockHash: block.hash,
    blockTimestamp: block.timestamp,
    asset: underlying,
    aToken: readAToken,
    decimals,
    ltvBps,
    liquidationThresholdBps,
    liquidationBonusBps,
    reserveFactorBps,
    collateralEnabled,
    borrowingEnabled,
    borrowCapWholeTokens: borrowCap,
    supplyCapWholeTokens: supplyCap,
    supplyHeadroomAtomic: supplyCap === 0n ? null : supplyCapAtomic - currentCapUsageAtomic,
    totalATokenAtomic: totalAToken,
    availableLiquidityAtomic,
    scaledTotalSupply,
    scaledSupplyAmount,
    validatedSupplyAtomic: input.amountAtomic,
    accruedToTreasuryScaled,
    pendingTreasuryAtomic: treasury.pendingTreasuryAtomic,
    nextLiquidityIndexRay: treasury.nextLiquidityIndexRay,
    capUsageAfterAtomic,
    totalStableDebtAtomic: totalStableDebt,
    totalVariableDebtAtomic: totalVariableDebt,
    liquidityRateRay,
  };
}
