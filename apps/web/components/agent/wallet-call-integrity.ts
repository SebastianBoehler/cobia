import type { Address, Hex } from "viem";
import { verifiedWalletCallMatchV1 } from "../../lib/open-exchange/wallet-call-match";

export interface VerifiedWalletCall { to: Address; data: Hex; value: "0x0" }
export interface MinedWalletCall { from?: string; to?: string | null; input?: string; value?: string }

export function assertWalletCallIntegrity(
  expected: VerifiedWalletCall,
  owner: Address,
  mined: MinedWalletCall | null,
  options: { allowSufficientApproval?: boolean } = {},
) {
  if (verifiedWalletCallMatchV1(expected, owner, mined, options)) return;
  const approval = expected.data.slice(0, 10).toLowerCase() === "0x095ea7b3";
  throw new Error(approval
    ? "Wallet approval does not cover the verified token amount and spender. Cobia stopped before the next call."
    : "Wallet changed the independently verified transaction. Cobia stopped before the next call.");
}
