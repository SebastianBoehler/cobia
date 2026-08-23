import {
  NATIVE_ASSET_ADDRESS,
  TransactionStageV1Schema,
  commitment,
  isNativeAssetAddress,
} from "@cobia/domain";
import { ProviderArtifactV1Schema, RawWalletArtifactV1Schema } from "@cobia/solvers";
import {
  encodeFunctionData,
  isAddressEqual,
  keccak256,
  parseAbi,
  type Address,
  type Hash,
} from "viem";

export const WOKB_ABI = parseAbi([
  "function deposit() payable",
  "function withdraw(uint256 amount)",
]);

export const XLAYER_WOKB = {
  chainId: 196 as const,
  address: "0xe538905cf8410324e03a5a23c1c177a474d59b2b" as Address,
  runtimeCodeHash: "0xde187307e119db7066ef4d8d154ba1617313e4c9a410c70378abe475cd2cffd2" as Hash,
};

export function buildNativeOkbStage(input: {
  stageId: string;
  owner: Address;
  inputToken: Address;
  outputToken: Address;
  amountAtomic: string;
  fetchedAt: number;
  expiresAt: number;
  dependsOn?: string[];
}) {
  if (input.expiresAt <= input.fetchedAt) throw new Error("Native OKB quote expiry is invalid");
  const wrapping = isNativeAssetAddress(input.inputToken) &&
    isAddressEqual(input.outputToken, XLAYER_WOKB.address);
  const unwrapping = isAddressEqual(input.inputToken, XLAYER_WOKB.address) &&
    isNativeAssetAddress(input.outputToken);
  if (!wrapping && !unwrapping) throw new Error("Native OKB pair must use canonical WOKB");
  const data = wrapping
    ? encodeFunctionData({ abi: WOKB_ABI, functionName: "deposit" })
    : encodeFunctionData({ abi: WOKB_ABI, functionName: "withdraw",
      args: [BigInt(input.amountAtomic)] });
  const valueAtomic = wrapping ? input.amountAtomic : "0";
  const request = { chainId: 196, operation: wrapping ? "wrap" : "unwrap",
    owner: input.owner, inputToken: input.inputToken, outputToken: input.outputToken,
    amountAtomic: input.amountAtomic };
  const response = { target: XLAYER_WOKB.address, dataHash: keccak256(data), valueAtomic };
  const stage = TransactionStageV1Schema.parse({
    id: input.stageId, kind: "wallet-transaction", chainId: 196,
    dependsOn: input.dependsOn ?? [],
    provider: "evm.raw@1", quoteHash: commitment(request), responseHash: commitment(response),
    fetchedAt: input.fetchedAt, expiresAt: input.expiresAt,
    sender: input.owner, recipient: input.owner,
    input: { token: input.inputToken, atomic: input.amountAtomic },
    output: { chainId: 196, token: input.outputToken, minimumAtomic: input.amountAtomic },
    transaction: { target: XLAYER_WOKB.address, selector: data.slice(0, 10),
      dataHash: keccak256(data), valueAtomic },
    tools: ["xlayer-wokb"],
  });
  const payload = RawWalletArtifactV1Schema.parse({
    version: 1, provider: "evm.raw@1", stageId: stage.id,
    transaction: { chainId: 196, from: input.owner, to: XLAYER_WOKB.address,
      data, valueAtomic },
  });
  const artifact = ProviderArtifactV1Schema.parse({
    stageId: stage.id, provider: "evm.raw@1", payloadHash: commitment(payload), payload,
  });
  return { stage, artifact, payload };
}

export { NATIVE_ASSET_ADDRESS };
