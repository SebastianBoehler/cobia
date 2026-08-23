import { TransactionStageV1Schema, commitment, isNativeAssetAddress } from "@cobia/domain";
import {
  OkxSwapArtifactV1Schema,
  OkxSwapRequestV1Schema,
  OkxSwapResponseV1Schema,
  ProviderArtifactV1Schema,
  XLAYER_OKX_MANIFEST_V1,
} from "@cobia/solvers";
import { concatHex, isAddress, keccak256, type Address } from "viem";
import { signOkxRequest, type OkxCredentials } from "../../../apps/web/lib/okx/auth";
import { referenceTransactionExpiry } from "./transaction-validity";

const OKX_SWAP_ORIGIN = "https://web3.okx.com";
const OKX_SWAP_PATH = "/api/v6/dex/aggregator/swap";

function canonicalAddress(value: string, label: string): Address {
  const canonical = value.toLowerCase();
  if (!isAddress(canonical)) throw new Error(`OKX ${label} address is invalid`);
  return canonical as Address;
}

export async function fetchOkxRouteArtifact(input: {
  credentials: OkxCredentials;
  owner: Address;
  inputToken: Address;
  outputToken: Address;
  inputAtomic: string;
  slippagePercent: string;
  stageId: string;
  now?: () => Date;
  fetchImpl?: typeof fetch;
}) {
  const owner = canonicalAddress(input.owner, "owner");
  const request = OkxSwapRequestV1Schema.parse({
    chainIndex: "196", amount: input.inputAtomic,
    fromTokenAddress: canonicalAddress(input.inputToken, "input"),
    toTokenAddress: canonicalAddress(input.outputToken, "output"),
    slippagePercent: input.slippagePercent, userWalletAddress: owner,
    swapReceiverAddress: owner, swapMode: "exactIn", disableRFQ: true,
    approveTransaction: false,
  });
  const url = new URL(OKX_SWAP_PATH, OKX_SWAP_ORIGIN);
  Object.entries(request).forEach(([name, value]) => url.searchParams.set(name, String(value)));
  const now = (input.now ?? (() => new Date()))();
  const timestamp = now.toISOString();
  const path = `${url.pathname}${url.search}`;
  const response = await (input.fetchImpl ?? fetch)(url, { method: "GET",
    headers: signOkxRequest({ ...input.credentials, timestamp, method: "GET", path }),
    cache: "no-store" });
  if (!response.ok) throw new Error(`OKX swap returned HTTP ${response.status}`);
  const body = OkxSwapResponseV1Schema.parse(await response.json());
  if (body.code !== "0") throw new Error(`OKX swap failed: ${body.msg}`);
  const data = body.data[0]!.tx.data;
  const fetchedAt = Math.floor(now.getTime() / 1_000);
  return OkxSwapArtifactV1Schema.parse({
    version: 1, provider: "okx.dex@1", stageId: input.stageId,
    fetchedAt, expiresAt: referenceTransactionExpiry(fetchedAt), request, response: body,
    attributedData: concatHex([data, XLAYER_OKX_MANIFEST_V1.builderDataSuffix]),
  });
}

export function okxMinimumOutputAtomic(raw: unknown) {
  return OkxSwapArtifactV1Schema.parse(raw).response.data[0]!.tx.minReceiveAmount;
}

export function buildOkxRouteStage(raw: {
  artifact: unknown;
  owner: Address;
  inputToken: Address;
  outputToken: Address;
  inputAtomic: string;
  minimumOutputAtomic: string;
  dependsOn?: string[];
}) {
  const artifact = OkxSwapArtifactV1Schema.parse(raw.artifact);
  const owner = canonicalAddress(raw.owner, "owner");
  const inputToken = canonicalAddress(raw.inputToken, "input");
  const outputToken = canonicalAddress(raw.outputToken, "output");
  if (isNativeAssetAddress(inputToken)) {
    throw new Error("OKX route builder currently requires ERC-20 input");
  }
  const request = artifact.request;
  const route = artifact.response.data[0]!.routerResult;
  const tx = artifact.response.data[0]!.tx;
  if (request.userWalletAddress !== owner || request.swapReceiverAddress !== owner ||
      tx.from !== owner) throw new Error("OKX owner mismatch does not satisfy the signed route");
  if (request.fromTokenAddress !== inputToken || route.fromToken.tokenContractAddress !== inputToken ||
      request.amount !== raw.inputAtomic || route.fromTokenAmount !== raw.inputAtomic) {
    throw new Error("OKX input mismatch does not satisfy the signed route");
  }
  if (request.toTokenAddress !== outputToken || route.toToken.tokenContractAddress !== outputToken) {
    throw new Error("OKX output mismatch does not satisfy the signed route");
  }
  if (BigInt(tx.minReceiveAmount) < BigInt(raw.minimumOutputAtomic) ||
      BigInt(route.toTokenAmount) < BigInt(raw.minimumOutputAtomic)) {
    throw new Error("OKX output floor does not satisfy the signed route");
  }
  if (tx.to !== XLAYER_OKX_MANIFEST_V1.router.address) throw new Error("OKX router mismatch");
  if (tx.value !== "0") throw new Error("OKX ERC-20 route value mismatch");
  const data = concatHex([tx.data, XLAYER_OKX_MANIFEST_V1.builderDataSuffix]);
  const selector = tx.data.slice(0, 10);
  if (artifact.attributedData !== data ||
      !XLAYER_OKX_MANIFEST_V1.router.selectors.includes(selector)) {
    throw new Error("OKX calldata or selector mismatch");
  }
  const stage = TransactionStageV1Schema.parse({
    id: artifact.stageId, kind: "wallet-transaction", chainId: 196,
    dependsOn: raw.dependsOn ?? [],
    provider: "okx.dex@1", quoteHash: commitment(request),
    responseHash: commitment(artifact.response), fetchedAt: artifact.fetchedAt,
    expiresAt: artifact.expiresAt, sender: owner, recipient: owner,
    input: { token: inputToken, atomic: raw.inputAtomic },
    output: { chainId: 196, token: outputToken, minimumAtomic: raw.minimumOutputAtomic },
    approval: { token: inputToken, spender: XLAYER_OKX_MANIFEST_V1.approval.address,
      maximumAtomic: raw.inputAtomic },
    transaction: { target: tx.to, selector, dataHash: keccak256(data), valueAtomic: "0" },
    tools: ["okx-dex-api"],
  });
  const providerArtifact = ProviderArtifactV1Schema.parse({
    stageId: stage.id, provider: "okx.dex@1", payloadHash: commitment(artifact), payload: artifact,
  });
  return { stage, providerArtifact };
}
