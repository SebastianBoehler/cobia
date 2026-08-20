import { describe, expect, it, vi } from "vitest";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import { seedCapabilityForkPrincipalV1 } from "./capability-fork-funding";

const owner = "0x1111111111111111111111111111111111111111" as const;
const token = PROTOCOL_REGISTRY.aaveV3.assets.USDG.underlying.address;
const source = PROTOCOL_REGISTRY.aaveV3.assets.USDG.aToken.address;
const hash = `0x${"12".repeat(32)}` as const;

describe("capability fork principal funding", () => {
  it("seeds only the missing signed principal before replay", async () => {
    const balances = new Map([[owner.toLowerCase(), 2n], [source.toLowerCase(), 100n]]);
    const forkRpc = vi.fn(async (method: string, params: readonly unknown[] = []) => {
      if (method === "eth_sendTransaction") {
        const transaction = params[0] as { data: string };
        balances.set(owner.toLowerCase(), balances.get(owner.toLowerCase())! +
          BigInt(`0x${transaction.data.slice(-64)}`));
        return hash;
      }
      return true;
    });

    await seedCapabilityForkPrincipalV1({ owner, token, amountAtomic: 10n, forkRpc,
      read: {
        getBalanceOf: async (_token, account) => balances.get(account.toLowerCase()) ?? 0n,
        waitForReceipt: async () => ({ status: "success", transactionHash: hash, logs: [] }),
      } });

    expect(balances.get(owner.toLowerCase())).toBe(10n);
    expect(forkRpc.mock.calls.map(([method]) => method)).toEqual([
      "anvil_setBalance", "anvil_impersonateAccount", "eth_sendTransaction",
      "anvil_stopImpersonatingAccount",
    ]);
  });

  it("does not mutate a fork when the owner already has the principal", async () => {
    const forkRpc = vi.fn();
    await seedCapabilityForkPrincipalV1({ owner, token, amountAtomic: 10n, forkRpc,
      read: {
        getBalanceOf: async () => 10n,
        waitForReceipt: async () => ({ status: "success", transactionHash: hash, logs: [] }),
      } });
    expect(forkRpc).not.toHaveBeenCalled();
  });
});
