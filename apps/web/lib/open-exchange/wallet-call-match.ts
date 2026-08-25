import { decodeFunctionData, erc20Abi, isAddress, isAddressEqual,
  type Address, type Hex } from "viem";

export interface ExpectedWalletCallV1 {
  to: Address;
  data: Hex;
  value: `0x${string}`;
}

export interface MinedWalletCallV1 {
  from?: string;
  to?: string | null;
  input?: string;
  value?: string;
}

function approval(data: string): { spender: Address; amount: bigint } | undefined {
  try {
    const decoded = decodeFunctionData({ abi: erc20Abi, data: data as Hex });
    if (decoded.functionName !== "approve") return undefined;
    return { spender: decoded.args[0], amount: decoded.args[1] };
  } catch {
    return undefined;
  }
}

export function verifiedWalletCallMatchV1(
  expected: ExpectedWalletCallV1,
  owner: Address,
  mined: MinedWalletCallV1 | null,
  options: { allowSufficientApproval?: boolean } = {},
): "exact" | "sufficient-approval" | undefined {
  if (!mined?.from || !mined.to || !mined.input || mined.value === undefined ||
      !isAddress(mined.from) || !isAddress(mined.to) ||
      !isAddressEqual(mined.from, owner) || !isAddressEqual(mined.to, expected.to)) return undefined;
  try {
    if (BigInt(mined.value) !== BigInt(expected.value)) return undefined;
  } catch {
    return undefined;
  }
  if (mined.input.toLowerCase() === expected.data.toLowerCase()) return "exact";
  if (!options.allowSufficientApproval) return undefined;
  const required = approval(expected.data);
  const actual = approval(mined.input);
  if (!required || !actual || !isAddressEqual(required.spender, actual.spender) ||
      actual.amount < required.amount) return undefined;
  return "sufficient-approval";
}
