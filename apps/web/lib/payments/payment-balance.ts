import {
  decodeFunctionResult,
  encodeFunctionData,
  formatUnits,
  type Address,
} from "viem";
import type { Eip1193Request, XLayerChainId } from "../wallet/eip1193";
import type { CurrentPaymentTerms } from "./terms";

const BALANCE_ABI = [{
  type: "function",
  name: "balanceOf",
  stateMutability: "view",
  inputs: [{ name: "account", type: "address" }],
  outputs: [{ name: "balance", type: "uint256" }],
}] as const;

const PAYMENT_RPC_URLS: Record<XLayerChainId, string> = {
  196: "https://rpc.xlayer.tech",
};

export interface PaymentChainReader {
  request(chainId: XLayerChainId, input: Eip1193Request): Promise<unknown>;
}

export const publicPaymentChainReader: PaymentChainReader = {
  async request(chainId, input) {
    const response = await fetch(PAYMENT_RPC_URLS[chainId], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...input }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json() as { result?: unknown; error?: { message?: string } };
    if (!response.ok || body.error || !("result" in body)) {
      throw new Error(body.error?.message ?? "X Layer RPC could not read the payment token.");
    }
    return body.result;
  },
};

export interface PaymentBalanceStatus {
  available: bigint;
  required: bigint;
  sufficient: boolean;
}

export async function readPaymentBalanceStatus(
  owner: Address,
  terms: CurrentPaymentTerms,
  reader: PaymentChainReader = publicPaymentChainReader,
): Promise<PaymentBalanceStatus> {
  const result = await reader.request(terms.paymentChainId, {
    method: "eth_call",
    params: [{
      to: terms.currency,
      data: encodeFunctionData({ abi: BALANCE_ABI, functionName: "balanceOf", args: [owner] }),
    }, "latest"],
  });
  if (typeof result !== "string") throw new Error("Payment-token balance response is malformed.");
  const available = decodeFunctionResult({
    abi: BALANCE_ABI,
    functionName: "balanceOf",
    data: result as `0x${string}`,
  });
  const required = BigInt(terms.amount);
  return { available, required, sufficient: available >= required };
}

function fixedPaymentAmount(value: bigint, decimals: number): string {
  const [whole, fraction = ""] = formatUnits(value, decimals).split(".");
  return `${whole}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

export function insufficientPaymentBalanceMessage(
  status: PaymentBalanceStatus,
  decimals: number,
): string {
  return `Insufficient USDt0 balance on X Layer Mainnet: ${
    fixedPaymentAmount(status.available, decimals)
  } USDt0 available, ${fixedPaymentAmount(status.required, decimals)} required. Fund USDt0 and start a fresh payment.`;
}
