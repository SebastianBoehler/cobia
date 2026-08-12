import { encodeFunctionData, getAddress, http, keccak256, createPublicClient, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import { testcontainersRehearsalRuntime } from "../execution-v2/anvil-rehearsal";
import { xLayer } from "../chain/xlayer";
import { replayCodingAgentProposalOnForkV1 } from "./fork-replay";

const ERC20_ABI = [{
  type: "function", name: "transfer", stateMutability: "nonpayable",
  inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }],
}, {
  type: "function", name: "balanceOf", stateMutability: "view",
  inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint256" }],
}, {
  type: "function", name: "approve", stateMutability: "nonpayable",
  inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }],
}] as const;
const POOL_ABI = [{
  type: "function", name: "supply", stateMutability: "nonpayable",
  inputs: [
    { name: "asset", type: "address" }, { name: "amount", type: "uint256" },
    { name: "onBehalfOf", type: "address" }, { name: "referralCode", type: "uint16" },
  ], outputs: [],
}] as const;
const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;
const GAS = "0x56bc75e2d63100000";
const AMOUNT = 10_000_000n;

function rpc(url: string) {
  let id = 0;
  return async (method: string, params: readonly unknown[] = []) => {
    const response = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    });
    const body = await response.json() as { result?: unknown; error?: { message?: string } };
    if (!response.ok || body.error) throw new Error(body.error?.message ?? `fork RPC ${method} failed`);
    return body.result;
  };
}

describe("coding-agent USDG Aave proposal on a pinned X Layer fork", () => {
  it("replays the unsigned approval and supply program without a mainnet send", async () => {
    const fork = await testcontainersRehearsalRuntime.start({
      blockNumber: BigInt(PROTOCOL_REGISTRY.auditedAtBlock.number),
    });
    const rawRpc = rpc(fork.rpcUrl);
    const buyer = privateKeyToAccount("0x59c6995e998f97a5a0044966f09453804c9b6a5d0b82a45e171e2523410f17e2");
    const usdg = PROTOCOL_REGISTRY.aaveV3.assets.USDG.underlying.address;
    const pool = PROTOCOL_REGISTRY.aaveV3.pool.address;
    try {
      const client = createPublicClient({ chain: xLayer, transport: http(fork.rpcUrl), cacheTime: 0 });
      const anchor = await client.getBlock({ blockNumber: BigInt(PROTOCOL_REGISTRY.auditedAtBlock.number) });
      if (!anchor.hash) throw new Error("Pinned fork block has no hash");
      await rawRpc("anvil_impersonateAccount", [PROTOCOL_REGISTRY.aaveV3.assets.USDG.aToken.address]);
      try {
        await rawRpc("anvil_setBalance", [PROTOCOL_REGISTRY.aaveV3.assets.USDG.aToken.address, GAS]);
        const funding = await rawRpc("eth_sendTransaction", [{
          from: PROTOCOL_REGISTRY.aaveV3.assets.USDG.aToken.address,
          to: usdg,
          data: encodeFunctionData({ abi: ERC20_ABI, functionName: "transfer", args: [buyer.address, AMOUNT] }),
          value: "0x0",
        }]) as Hash;
        await client.waitForTransactionReceipt({ hash: funding });
      } finally {
        await rawRpc("anvil_stopImpersonatingAccount", [PROTOCOL_REGISTRY.aaveV3.assets.USDG.aToken.address]);
      }
      const output = await replayCodingAgentProposalOnForkV1({
        proposal: {
          version: 1, requestId: "550e8400-e29b-41d4-a716-446655440099",
          policyHash: `0x${"99".repeat(32)}`, chainId: 196, owner: buyer.address, deadline: Number(anchor.timestamp) + 300,
          calls: [
            { to: usdg, valueAtomic: "0", data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [pool, AMOUNT] }) },
            { to: pool, valueAtomic: "0", data: encodeFunctionData({ abi: POOL_ABI, functionName: "supply", args: [usdg, AMOUNT, buyer.address, 0] }) },
          ],
          minimumFinalBalances: [{ asset: usdg, owner: buyer.address, atomic: "0" }],
        },
        anchor: { number: anchor.number.toString(), hash: anchor.hash },
        rpc: rawRpc,
        read: {
          getChainId: () => client.getChainId(),
          getBlock: (blockNumber) => client.getBlock({ blockNumber }),
          waitForReceipt: async (hash) => {
            const receipt = await client.waitForTransactionReceipt({ hash });
            return { status: receipt.status, transactionHash: receipt.transactionHash, blockHash: receipt.blockHash, blockNumber: receipt.blockNumber, logs: receipt.logs };
          },
          getBalanceOf: (asset, owner) => client.readContract({ address: asset, abi: ERC20_ABI, functionName: "balanceOf", args: [owner] }),
          getCodeHash: async (address) => {
            const code = await client.getCode({ address });
            if (!code) throw new Error("Fork target has no code");
            return keccak256(code);
          },
          getImplementation: async (address) => {
            const word = await client.getStorageAt({ address, slot: IMPLEMENTATION_SLOT });
            if (!word || /^0x0+$/.test(word)) return undefined;
            const implementation = getAddress(`0x${word.slice(-40)}`);
            const code = await client.getCode({ address: implementation });
            if (!code) throw new Error("Fork implementation has no code");
            return { address: implementation, runtimeCodeHash: keccak256(code) };
          },
        },
      });
      expect(output.reproduced).toBe(true);
      expect(output.finalBalances).toEqual([{
        asset: usdg.toLowerCase(),
        owner: buyer.address.toLowerCase(),
        atomic: "0",
      }]);
      expect(output.deployments.map(({ address }) => address.toLowerCase())).toEqual([
        usdg.toLowerCase(), pool.toLowerCase(),
      ]);
    } finally {
      await fork.stop();
    }
  });
});
