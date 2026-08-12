import {
  getAddress,
  isAddressEqual,
  recoverTypedDataAddress,
  type Address,
  type Hex,
} from "viem";
import {
  LEGACY_PAYMENT_EIP712_DOMAIN,
  PAYMENT_EIP712_DOMAIN,
} from "./support";
import type { PaymentTerms } from "./terms";

export const EIP3009_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export const EIP3009_RPC_TYPES = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
  ...EIP3009_AUTHORIZATION_TYPES,
} as const;

export interface SignedEip3009Authorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
  signature: string;
}

export async function requireEip3009OwnerSignature(
  authorization: SignedEip3009Authorization,
  owner: Address,
  terms: PaymentTerms,
): Promise<void> {
  const domain = terms.version === 2
    ? PAYMENT_EIP712_DOMAIN
    : LEGACY_PAYMENT_EIP712_DOMAIN;
  const signer = await recoverTypedDataAddress({
    domain,
    types: EIP3009_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      from: getAddress(authorization.from),
      to: getAddress(authorization.to),
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce as Hex,
    },
    signature: authorization.signature as Hex,
  });
  if (!isAddressEqual(signer, owner)) {
    throw new Error("Payment credential EIP-3009 signature does not match owner");
  }
}
