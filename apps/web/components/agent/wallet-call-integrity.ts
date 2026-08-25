import { isAddressEqual, type Address, type Hex } from "viem";

export interface VerifiedWalletCall { to: Address; data: Hex; value: "0x0" }
export interface MinedWalletCall { from?: string; to?: string | null; input?: string; value?: string }

export function assertWalletCallIntegrity(
  expected: VerifiedWalletCall,
  owner: Address,
  mined: MinedWalletCall | null,
) {
  const matches = mined?.from && mined.to && mined.input && mined.value &&
    isAddressEqual(mined.from as Address, owner) &&
    isAddressEqual(mined.to as Address, expected.to) &&
    mined.input.toLowerCase() === expected.data.toLowerCase() &&
    BigInt(mined.value) === BigInt(expected.value);
  if (matches) return;
  const approval = expected.data.slice(0, 10).toLowerCase() === "0x095ea7b3";
  throw new Error(approval
    ? "Wallet changed the exact token approval. Cobia stopped before the next call; revoke the changed allowance before retrying."
    : "Wallet changed the independently verified transaction. Cobia stopped before the next call.");
}
