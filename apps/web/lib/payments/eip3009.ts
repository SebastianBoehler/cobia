import { Challenge, Credential } from "@okxweb3/mpp";
import { chargeSchema } from "@okxweb3/mpp/evm";
import {
  decodeFunctionResult,
  getAddress,
  isAddressEqual,
  isHex,
  type Address,
  type Hex,
} from "viem";
import type { Eip1193Request, XLayerChainId } from "../wallet/eip1193";

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
const AUTHORIZATION_TYPES = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

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

function randomNonce(): Hex {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function tokenDomain(reader: PaymentChainReader, currency: Address, chainId: XLayerChainId) {
  const input = {
    method: "eth_call",
    params: [{ to: currency, data: DOMAIN_CALL }, "latest"],
  } as const;
  const result = await reader.request(chainId, input);
  if (typeof result !== "string" || !isHex(result)) {
    throw new Error("The payment token did not return EIP-712 domain metadata.");
  }
  const [fields, name, version, tokenChainId, verifyingContract] = decodeFunctionResult({
    abi: DOMAIN_ABI,
    functionName: "eip712Domain",
    data: result,
  });
  if ((Number.parseInt(fields.slice(2), 16) & 0x0f) !== 0x0f) {
    throw new Error("The payment token exposes an incomplete EIP-712 domain.");
  }
  if (tokenChainId !== BigInt(chainId) || !isAddressEqual(verifyingContract, currency)) {
    throw new Error("The payment token domain does not match the requested chain and asset.");
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
  const message = { from: wallet.account, to, value, validAfter, validBefore, nonce: randomNonce() };
  const signature = await wallet.request({
    method: "eth_signTypedData_v4",
    params: [wallet.account, JSON.stringify({
      domain,
      types: AUTHORIZATION_TYPES,
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
  reader: PaymentChainReader = publicChainReader,
): Promise<string> {
  const challenge = Challenge.fromResponse(response);
  if (challenge.method !== "evm" || challenge.intent !== "charge") {
    throw new Error("Cobia received an unsupported payment challenge.");
  }
  const payment = chargeSchema.schema.request.parse(challenge.request);
  const chainId = payment.methodDetails.chainId;
  if (chainId !== 196 && chainId !== 1952) throw new Error(`Unsupported payment chain ${chainId}.`);
  const currency = getAddress(payment.currency);
  const splits = payment.methodDetails.splits ?? [];
  const splitTotal = splits.reduce((sum, split) => sum + BigInt(split.amount), 0n);
  const recipientAmount = BigInt(payment.amount) - splitTotal;
  if (recipientAmount <= 0n) throw new Error("The payment split consumes the full charge.");

  await wallet.switchChain(chainId);
  const domain = await tokenDomain(reader, currency, chainId);
  const now = Math.floor(Date.now() / 1_000);
  const validAfter = Math.max(0, now - 60).toString();
  const challengeExpiry = challenge.expires ? Math.floor(Date.parse(challenge.expires) / 1_000) : now + 600;
  if (!Number.isFinite(challengeExpiry) || challengeExpiry <= now) {
    throw new Error("The payment challenge has expired.");
  }
  const validBefore = challengeExpiry.toString();
  const authorization = await signAuthorization(
    wallet, domain, getAddress(payment.recipient), recipientAmount.toString(), validAfter, validBefore,
  );
  const signedSplits = [];
  for (const split of splits) {
    signedSplits.push(await signAuthorization(
      wallet, domain, getAddress(split.recipient), split.amount, validAfter, validBefore,
    ));
  }
  return Credential.serialize(Credential.from({
    challenge,
    source: `did:pkh:eip155:${chainId}:${wallet.account}`,
    payload: {
      type: "transaction",
      authorization: { type: "eip-3009", ...authorization, splits: signedSplits },
    },
  }));
}
