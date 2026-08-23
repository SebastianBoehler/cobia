import { TransactionStageV1Schema, commitment } from "@cobia/domain";
import { ProviderArtifactV1Schema, RawWalletArtifactV1Schema } from "@cobia/solvers";
import {
  encodeFunctionData,
  isAddressEqual,
  keccak256,
  parseAbi,
  type Address,
} from "viem";
import { PROTOCOL_REGISTRY } from "../../../apps/web/lib/adapters/registry";

export const AAVE_POOL_ABI = parseAbi([
  "function withdraw(address asset,uint256 amount,address to) returns (uint256)",
]);

export function aaveAssetForReceipt(aToken: Address) {
  return Object.values(PROTOCOL_REGISTRY.aaveV3.assets).find((asset) =>
    isAddressEqual(asset.aToken.address, aToken));
}

export function buildAaveWithdrawStage(input: {
  stageId: string;
  owner: Address;
  aToken: Address;
  underlying: Address;
  amountAtomic: string;
  fetchedAt: number;
  expiresAt: number;
}) {
  const asset = aaveAssetForReceipt(input.aToken);
  if (!asset || !isAddressEqual(asset.underlying.address, input.underlying)) {
    throw new Error("Aave withdraw requires a registered receipt and underlying pair");
  }
  if (input.expiresAt <= input.fetchedAt) throw new Error("Aave withdraw expiry is invalid");
  const owner = input.owner.toLowerCase() as Address;
  const aToken = asset.aToken.address.toLowerCase() as Address;
  const underlying = asset.underlying.address.toLowerCase() as Address;
  const pool = PROTOCOL_REGISTRY.aaveV3.pool.address.toLowerCase() as Address;
  const data = encodeFunctionData({ abi: AAVE_POOL_ABI, functionName: "withdraw",
    args: [underlying, BigInt(input.amountAtomic), owner] });
  const request = { chainId: 196, operation: "withdraw", owner, aToken, underlying,
    amountAtomic: input.amountAtomic };
  const response = { target: pool, dataHash: keccak256(data), valueAtomic: "0" };
  const stage = TransactionStageV1Schema.parse({
    id: input.stageId, kind: "wallet-transaction", chainId: 196, dependsOn: [],
    provider: "evm.raw@1", quoteHash: commitment(request), responseHash: commitment(response),
    fetchedAt: input.fetchedAt, expiresAt: input.expiresAt, sender: owner, recipient: owner,
    input: { token: aToken, atomic: input.amountAtomic },
    output: { chainId: 196, token: underlying, minimumAtomic: input.amountAtomic },
    transaction: { target: pool, selector: data.slice(0, 10),
      dataHash: keccak256(data), valueAtomic: "0" }, tools: ["aave-v3.withdraw"],
  });
  const payload = RawWalletArtifactV1Schema.parse({ version: 1, provider: "evm.raw@1",
    stageId: stage.id, transaction: { chainId: 196, from: owner, to: pool,
      data, valueAtomic: "0" } });
  const artifact = ProviderArtifactV1Schema.parse({ stageId: stage.id,
    provider: "evm.raw@1", payloadHash: commitment(payload), payload });
  return { stage, artifact, payload };
}
