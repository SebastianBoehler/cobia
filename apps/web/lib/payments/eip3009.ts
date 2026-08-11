import { Credential } from "@okxweb3/mpp";
import {
  decodeFunctionResult,
  getAddress,
  isAddressEqual,
  isHex,
  type Address,
} from "viem";
import type { Eip1193Request, XLayerChainId } from "../wallet/eip1193";
import {
  validatePaymentChallenge,
  type ExpectedPaymentAuthorization,
} from "./challenge";
import { EIP3009_RPC_TYPES } from "./eip3009-authorization";
import { randomBytes32 } from "./random";
import {
  PAYMENT_EIP712_NAME,
  PAYMENT_EIP712_VERSION,
} from "./support";

const DOMAIN_ABI = [{
  type: "function",
  name: "eip712Domain",
  stateMutability: "view",
  inputs: [],
  outputs: [
    { name: "fields", type: "bytes1" },
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
    { name: "salt", type: "bytes32" },
    { name: "extensions", type: "uint256[]" },
  ],
}] as const;

const DOMAIN_CALL = "0x84b0196e";
interface WalletAccess {
  account: Address;
  request(input: Eip1193Request): Promise<unknown>;
  switchChain(chainId: XLayerChainId): Promise<void>;
}

export interface PaymentChainReader {
  request(chainId: XLayerChainId, input: Eip1193Request): Promise<unknown>;
}

const PAYMENT_RPC_URLS: Record<XLayerChainId, string> = {
  196: "https://rpc.xlayer.tech",
  1952: "https://testrpc.xlayer.tech/terigon",
};

const publicChainReader: PaymentChainReader = {
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

async function tokenDomain(reader: PaymentChainReader, currency: Address, chainId: XLayerChainId) {
  const input = {
    method: "eth_call",
    params: [{ to: currency, data: DOMAIN_CALL }, "latest"],
  } as const;
  const result = await reader.request(chainId, input);
  if (typeof result !== "string" || !isHex(result)) {
    throw new Error("The payment token did not return EIP-712 domain metadata.");
  }
  const [fields, name, version, tokenChainId, verifyingContract, , extensions] = decodeFunctionResult({
    abi: DOMAIN_ABI,
    functionName: "eip712Domain",
    data: result,
  });
  if (Number.parseInt(fields.slice(2), 16) !== 0x0f || extensions.length !== 0) {
    throw new Error("The payment token exposes an unsupported EIP-712 domain.");
  }
  if (tokenChainId !== BigInt(chainId) || !isAddressEqual(verifyingContract, currency)) {
    throw new Error("The payment token domain does not match the requested chain and asset.");
  }
  if (name !== PAYMENT_EIP712_NAME || version !== PAYMENT_EIP712_VERSION) {
    throw new Error("The payment token domain name or version is unsupported.");
  }
  return { name, version, chainId, verifyingContract: currency };
}

async function signAuthorization(
  wallet: WalletAccess,
  domain: Awaited<ReturnType<typeof tokenDomain>>,
  to: Address,
  value: string,
  validAfter: string,
  validBefore: string,
) {
  const message = { from: wallet.account, to, value, validAfter, validBefore, nonce: randomBytes32() };
  const signature = await wallet.request({
    method: "eth_signTypedData_v4",
    params: [wallet.account, JSON.stringify({
      domain,
      types: EIP3009_RPC_TYPES,
      primaryType: "TransferWithAuthorization",
      message,
    })],
  });
  if (typeof signature !== "string" || !isHex(signature) || signature.length !== 132) {
    throw new Error("The wallet returned an invalid EIP-3009 signature.");
  }
  return { ...message, signature };
}

export async function authorizePayment(
  response: Response,
  wallet: WalletAccess,
  expected?: ExpectedPaymentAuthorization,
  reader: PaymentChainReader = publicChainReader,
): Promise<string> {
  if (!expected) throw new Error("Expected payment terms are required");
  const now = Math.floor(Date.now() / 1_000);
  const validated = validatePaymentChallenge(response, expected, now);
  if (!isAddressEqual(wallet.account, validated.owner)) {
    throw new Error("Payment wallet must be the policy owner");
  }

  const chainId = validated.terms.paymentChainId;
  await wallet.switchChain(chainId);
  const domain = await tokenDomain(reader, validated.currency, chainId);
  const validAfter = Math.max(0, now - 60).toString();
  const validBefore = validated.terms.expiresAt.toString();
  const authorization = await signAuthorization(
    wallet,
    domain,
    validated.recipient,
    validated.recipientAmount,
    validAfter,
    validBefore,
  );
  const signedSplits = [];
  for (const split of validated.splits) {
    signedSplits.push(await signAuthorization(
      wallet, domain, getAddress(split.recipient), split.amount, validAfter, validBefore,
    ));
  }
  return Credential.serialize(Credential.from({
    challenge: validated.challenge,
    source: `did:pkh:eip155:${chainId}:${wallet.account}`,
    payload: {
      type: "transaction",
      authorization: { type: "eip-3009", ...authorization, splits: signedSplits },
    },
  }));
}
