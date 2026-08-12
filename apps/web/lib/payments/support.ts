import type { Address } from "viem";

export const PAYMENT_CHAIN_ID = 196 as const;
export const PAYMENT_ASSET: Address = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736";
export const PAYMENT_DECIMALS = 6 as const;
export const PAYMENT_EIP712_NAME = "USD₮0" as const;
export const PAYMENT_EIP712_VERSION = "1" as const;

export const LEGACY_PAYMENT_CHAIN_ID = 1952 as const;
export const LEGACY_PAYMENT_ASSET: Address =
  "0x9e29b3AaDa05Bf2D2c827Af80Bd28Dc0b9b4FB0c";

export const PAYMENT_EIP712_DOMAIN = {
  name: PAYMENT_EIP712_NAME,
  version: PAYMENT_EIP712_VERSION,
  chainId: PAYMENT_CHAIN_ID,
  verifyingContract: PAYMENT_ASSET,
} as const;

export const LEGACY_PAYMENT_EIP712_DOMAIN = {
  name: PAYMENT_EIP712_NAME,
  version: PAYMENT_EIP712_VERSION,
  chainId: LEGACY_PAYMENT_CHAIN_ID,
  verifyingContract: LEGACY_PAYMENT_ASSET,
} as const;
