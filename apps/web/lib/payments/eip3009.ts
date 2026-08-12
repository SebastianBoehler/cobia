import { Credential } from "@okxweb3/mpp";
import {
  decodeFunctionResult,
  encodeAbiParameters,
  getAddress,
  isAddressEqual,
  isHex,
  keccak256,
  stringToHex,
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
  insufficientPaymentBalanceMessage,
  publicPaymentChainReader,
  readPaymentBalanceStatus,
  type PaymentChainReader,
} from "./payment-balance";
import { isCurrentPaymentTerms } from "./terms";
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
const DOMAIN_SEPARATOR_CALL = "0x3644e515";
interface WalletAccess {
  account: Address;
  request(input: Eip1193Request): Promise<unknown>;
  switchChain(chainId: XLayerChainId): Promise<void>;
}

async function tokenDomain(reader: PaymentChainReader, currency: Address, chainId: XLayerChainId) {
  const input = {
    method: "eth_call",
    params: [{ to: currency, data: DOMAIN_CALL }, "latest"],
  } as const;
  let result: unknown;
  try {
    result = await reader.request(chainId, input);
  } catch {
    const separator = await reader.request(chainId, {
      method: "eth_call",
      params: [{ to: currency, data: DOMAIN_SEPARATOR_CALL }, "latest"],
    });
    const domainTypeHash = keccak256(stringToHex(
      "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)",
    ));
    const expected = keccak256(encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
      ],
      [
        domainTypeHash,
        keccak256(stringToHex(PAYMENT_EIP712_NAME)),
        keccak256(stringToHex(PAYMENT_EIP712_VERSION)),
        BigInt(chainId),
        currency,
      ],
    ));
    if (typeof separator !== "string" || separator.toLowerCase() !== expected.toLowerCase()) {
      throw new Error("The payment token domain separator is unsupported.");
    }
    return {
      name: PAYMENT_EIP712_NAME,
      version: PAYMENT_EIP712_VERSION,
      chainId,
      verifyingContract: currency,
    };
  }
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
  reader: PaymentChainReader = publicPaymentChainReader,
): Promise<string> {
  if (!expected) throw new Error("Expected payment terms are required");
  const now = Math.floor(Date.now() / 1_000);
  const validated = validatePaymentChallenge(response, expected, now);
  if (!isCurrentPaymentTerms(validated.terms)) {
    throw new Error("Historical testnet payment terms are read-only");
  }
  if (!isAddressEqual(wallet.account, validated.owner)) {
    throw new Error("Payment wallet must be the policy owner");
  }

  const chainId = validated.terms.paymentChainId;
  await wallet.switchChain(chainId);
  let balance;
  try {
    balance = await readPaymentBalanceStatus(validated.owner, validated.terms, reader);
  } catch {
    throw new Error(
      "Cobia could not verify your USDt0 balance on X Layer Mainnet. Check your RPC connection and try again.",
    );
  }
  if (!balance.sufficient) {
    throw new Error(insufficientPaymentBalanceMessage(balance, validated.terms.decimals));
  }
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
