import { createPublicClient, http, keccak256 } from "viem";
import { base } from "viem/chains";
import { xLayer } from "../chain/xlayer";
import { authorizeCommercePlacementV1 } from "../commerce/authorization-service";
import { nodeCommerceFetchV1, nodeDnsResolverV1 } from "../commerce/node-commerce-fetch";
import { verifyCommerceProgramV1 } from "../commerce/program-verifier";
import { prepareCommercePlacementV1 } from "../commerce/placement-service";
import { productionCommerceMerchantManifestV1 } from "../commerce/production-manifest";
import { reproduceX402PlanV1 } from "../commerce/x402-reproduction";
import { executeX402ResourceV1 } from "../commerce/x402-resource-client";
import { X402SettlementResponseV2Schema } from "../commerce/x402-resource-client";
import { verifyX402SettlementReceiptV1 } from "../commerce/x402-receipt-verifier";
import { confirmCommerceSettlementV1 } from "../commerce/settlement-service";
import { readCommerceRuntimeConfig } from "../env";
import { getCommerceOfferRepository, getCommercePlacementRepository } from "./market";

export async function prepareProductionCommercePlacementV1(input: {
  policy: unknown; ownerSignature: unknown; program: unknown; evidence: unknown;
}) {
  const config = readCommerceRuntimeConfig();
  const manifest = productionCommerceMerchantManifestV1();
  const client = createPublicClient({
    chain: manifest.chainId === 8453 ? base : xLayer,
    transport: http(manifest.chainId === 8453 ? config.BASE_RPC_URL : config.XLAYER_RPC_URL,
      { timeout: 15_000 }),
    cacheTime: 0,
  });
  if (await client.getChainId() !== manifest.chainId) throw new Error("Commerce RPC chain mismatch");
  return prepareCommercePlacementV1(input, {
    nowSec: Math.floor(Date.now() / 1_000),
    executor: config.COBIA_EXECUTOR_V3_ADDRESS,
    manifest,
    offers: getCommerceOfferRepository(),
    placements: getCommercePlacementRepository(),
    verify: (value) => verifyCommerceProgramV1({
      ...value,
      async confirmAnchor(anchor) {
        const block = await client.getBlock({ blockNumber: BigInt(anchor.number) });
        return block.hash?.toLowerCase() === anchor.hash.toLowerCase();
      },
      async readCodeHash(address, block) {
        const code = await client.getCode({ address, blockNumber: BigInt(block.number) });
        if (!code || code === "0x") throw new Error("Commerce deployment has no runtime code");
        return keccak256(code);
      },
      async replay(compiled) {
        return reproduceX402PlanV1(compiled);
      },
    }),
  });
}

export function authorizeProductionCommercePlacementV1(input: {
  placementId: unknown; template: unknown; signature: unknown;
}) {
  return authorizeCommercePlacementV1(input, {
    nowSec: Math.floor(Date.now() / 1_000),
    placements: getCommercePlacementRepository(),
    execute: (value) => executeX402ResourceV1({
      ...value,
      dnsResolver: nodeDnsResolverV1,
      fetcher: nodeCommerceFetchV1,
    }),
  });
}

export async function confirmProductionCommerceSettlementV1(input: {
  placementId: unknown; plan: unknown; template: unknown;
  signature: unknown; settlement: unknown;
}) {
  const config = readCommerceRuntimeConfig();
  const manifest = productionCommerceMerchantManifestV1();
  const client = createPublicClient({
    chain: manifest.chainId === 8453 ? base : xLayer,
    transport: http(manifest.chainId === 8453 ? config.BASE_RPC_URL : config.XLAYER_RPC_URL,
      { timeout: 15_000 }),
    cacheTime: 0,
  });
  if (await client.getChainId() !== manifest.chainId) throw new Error("Commerce RPC chain mismatch");
  return confirmCommerceSettlementV1(input, {
    nowSec: Math.floor(Date.now() / 1_000),
    placements: getCommercePlacementRepository(),
    async verify(value) {
      const settlement = X402SettlementResponseV2Schema.parse(value.settlement);
      const [transaction, receipt, latestBlockNumber] = await Promise.all([
        client.getTransaction({ hash: settlement.transaction }),
        client.getTransactionReceipt({ hash: settlement.transaction }),
        client.getBlockNumber(),
      ]);
      if (transaction.blockNumber === null || transaction.blockHash === null) {
        throw new Error("Commerce settlement is not mined");
      }
      const block = await client.getBlock({ blockNumber: transaction.blockNumber });
      return verifyX402SettlementReceiptV1({
        ...value,
        transaction: {
          hash: transaction.hash, to: transaction.to, input: transaction.input,
          blockNumber: transaction.blockNumber.toString(), blockHash: transaction.blockHash,
          blockTimestampSec: Number(block.timestamp),
        },
        receipt: {
          transactionHash: receipt.transactionHash, status: receipt.status,
          blockNumber: receipt.blockNumber.toString(), blockHash: receipt.blockHash,
          logs: receipt.logs.map((log) => ({
            address: log.address, topics: [...log.topics], data: log.data,
          })),
        },
        latestBlockNumber: latestBlockNumber.toString(),
        minimumConfirmations: 2,
        async confirmAnchor(anchor) {
          const anchored = await client.getBlock({ blockNumber: BigInt(anchor.number) });
          return anchored.hash?.toLowerCase() === anchor.hash.toLowerCase();
        },
        async readCodeHash(address, anchor) {
          const code = await client.getCode({ address, blockNumber: BigInt(anchor.number) });
          if (!code || code === "0x") throw new Error("Payment token has no runtime code");
          return keccak256(code);
        },
      });
    },
  });
}
