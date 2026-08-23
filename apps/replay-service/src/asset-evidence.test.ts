import { decodeFunctionData, encodeAbiParameters, erc20Abi, type Address, type Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
import { probePlainErc20OnFork } from "./asset-evidence";
import { replayAssetEvidence, replayAtPath } from "./replay";

const token = "0x1111111111111111111111111111111111111111" as const;
const source = "0x2222222222222222222222222222222222222222" as const;

function successfulTokenRpc() {
  const balances = new Map<string, bigint>([[source, 10_000n]]);
  const allowances = new Map<string, bigint>();
  const receipts = new Map<string, unknown>();
  const methods: string[] = [];
  let nonce = 0;
  const balance = (address: Address) => balances.get(address.toLowerCase()) ?? 0n;
  const allowanceKey = (owner: Address, spender: Address) => `${owner.toLowerCase()}:${spender.toLowerCase()}`;
  const callResult = (data: Hex) => {
    const decoded = decodeFunctionData({ abi: erc20Abi, data });
    if (decoded.functionName === "balanceOf") {
      return encodeAbiParameters([{ type: "uint256" }], [balance(decoded.args[0])]);
    }
    if (decoded.functionName === "allowance") {
      return encodeAbiParameters([{ type: "uint256" }], [allowances.get(allowanceKey(...decoded.args)) ?? 0n]);
    }
    return encodeAbiParameters([{ type: "bool" }], [true]);
  };
  const rpc = async (method: string, params: readonly unknown[] = []) => {
    methods.push(method);
    if (method === "eth_chainId") return "0xc4";
    if (method === "eth_getCode") return "0x60006000";
    if (method === "eth_call") return callResult((params[0] as { data: Hex }).data);
    if (["anvil_setBalance", "anvil_impersonateAccount", "anvil_stopImpersonatingAccount"].includes(method)) return true;
    if (method === "debug_traceTransaction") return { type: "CALL", from: source, to: token, calls: [] };
    if (method === "eth_getTransactionReceipt") return receipts.get(String(params[0])) ?? null;
    if (method !== "eth_sendTransaction") throw new Error(`Unexpected ${method}`);
    const transaction = params[0] as { from: Address; data: Hex };
    const decoded = decodeFunctionData({ abi: erc20Abi, data: transaction.data });
    if (decoded.functionName === "transfer") {
      const [recipient, amount] = decoded.args;
      balances.set(transaction.from.toLowerCase(), balance(transaction.from) - amount);
      balances.set(recipient.toLowerCase(), balance(recipient) + amount);
    } else if (decoded.functionName === "approve") {
      allowances.set(allowanceKey(transaction.from, decoded.args[0]), decoded.args[1]);
    } else if (decoded.functionName === "transferFrom") {
      const [owner, recipient, amount] = decoded.args;
      balances.set(owner.toLowerCase(), balance(owner) - amount);
      balances.set(recipient.toLowerCase(), balance(recipient) + amount);
      allowances.set(allowanceKey(owner, transaction.from),
        (allowances.get(allowanceKey(owner, transaction.from)) ?? 0n) - amount);
    }
    const hash = `0x${(++nonce).toString(16).padStart(64, "0")}`;
    receipts.set(hash, { status: "0x1", transactionHash: hash, logs: [] });
    return hash;
  };
  return { rpc, methods };
}

describe("general asset behavior replay", () => {
  it("proves exact transfer, transferFrom, and allowance cleanup on a disposable fork", async () => {
    const fork = successfulTokenRpc();

    const result = await probePlainErc20OnFork({ chainId: 196, blockNumber: "123",
      token, source, probeAtomic: "1000" }, fork.rpc);

    expect(result).toMatchObject({
      transferReturn: "true", transferFromReturn: "true", approveReturn: "true",
      transferAtomic: "1000", senderDecreaseAtomic: "1000", recipientIncreaseAtomic: "1000",
      allowanceDecreaseAtomic: "1000", approvalCleanupSucceeded: true,
      replayDeterministic: true, balancesStableWithoutTransfers: true, callbackCount: 0,
    });
    expect(fork.methods).toContain("anvil_impersonateAccount");
    expect(fork.methods).toContain("anvil_stopImpersonatingAccount");
  });

  it("pins the requested chain and always stops the disposable fork", async () => {
    const fork = successfulTokenRpc();
    const stop = vi.fn(async () => undefined);
    const startFork = async () => ({ rpc: fork.rpc, read: {} as never, stop });

    const result = await replayAssetEvidence({ chainId: 196, blockNumber: "123",
      token, source, probeAtomic: "1000" }, {
      REPLAY_SERVICE_SECRET: "s".repeat(32), XLAYER_RPC_URL: "https://xlayer.example",
      ETHEREUM_RPC_URL: "https://ethereum.example", BASE_RPC_URL: "https://base.example",
      PORT: 3001, REPLAY_MAX_CONCURRENCY: 1,
    }, startFork);

    expect(result.transferReturn).toBe("true");
    expect(fork.methods).toContain("eth_chainId");
    expect(stop).toHaveBeenCalledOnce();
  });

  it("dispatches the authenticated asset-evidence path", async () => {
    const fork = successfulTokenRpc();
    const startFork = async () => ({ rpc: fork.rpc, read: {} as never, stop: async () => undefined });

    const result = await replayAtPath("/v1/replays/asset-evidence", {
      chainId: 196, blockNumber: "123", token, source, probeAtomic: "1000",
    }, {
      REPLAY_SERVICE_SECRET: "s".repeat(32), XLAYER_RPC_URL: "https://xlayer.example",
      ETHEREUM_RPC_URL: "https://ethereum.example", BASE_RPC_URL: "https://base.example",
      PORT: 3001, REPLAY_MAX_CONCURRENCY: 1,
    }, startFork);

    expect(result).toMatchObject({ transferReturn: "true", approvalCleanupSucceeded: true });
  });
});
