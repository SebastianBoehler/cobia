import { commitment } from "@cobia/domain";
import type { CapabilityProgramV1 } from "@cobia/solvers";
import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  http,
  keccak256,
  type Address,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { PROTOCOL_REGISTRY, registryHash } from "../adapters/registry";
import { EIP1967_IMPLEMENTATION_SLOT } from "../adapters/read-client";
import { aaveSupplyCapabilityV1 } from "../capabilities/aave-supply";
import { productionCapabilityManifestV1 } from "../capabilities/manifest";
import { xLayer } from "../chain/xlayer";
import { testcontainersRehearsalRuntime } from "../execution-v2/anvil-rehearsal";
import { replayCapabilityProgramOnForkV1 } from "./capability-fork-replay";

const AMOUNT = 10_000_000n;
const GAS = "0x56bc75e2d63100000";

function rpc(url: string) {
  let id = 0;
  return async (method: string, params: readonly unknown[] = []) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    });
    const body = await response.json() as { result?: unknown; error?: { message?: string } };
    if (!response.ok || body.error) throw new Error(body.error?.message ?? `${method} failed`);
    return body.result;
  };
}

describe("open capability program on a pinned X Layer fork", () => {
  it("compiles and replays a real USDG Aave supply without a mainnet send", async () => {
    const fork = await testcontainersRehearsalRuntime.start({
      blockNumber: BigInt(PROTOCOL_REGISTRY.auditedAtBlock.number),
    });
    const rawRpc = rpc(fork.rpcUrl);
    const client = createPublicClient({ chain: xLayer, transport: http(fork.rpcUrl), cacheTime: 0 });
    const owner = privateKeyToAccount(`0x${"51".repeat(32)}`).address;
    const executor = privateKeyToAccount(`0x${"52".repeat(32)}`).address;
    const asset = PROTOCOL_REGISTRY.aaveV3.assets.USDG;
    try {
      const anchor = await client.getBlock({
        blockNumber: BigInt(PROTOCOL_REGISTRY.auditedAtBlock.number),
      });
      if (!anchor.hash) throw new Error("Pinned fork block has no hash");
      await rawRpc("anvil_impersonateAccount", [asset.aToken.address]);
      try {
        await rawRpc("anvil_setBalance", [asset.aToken.address, GAS]);
        const hash = await rawRpc("eth_sendTransaction", [{
          from: asset.aToken.address,
          to: asset.underlying.address,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "transfer",
            args: [owner, AMOUNT],
          }),
          value: "0x0",
        }]) as Hash;
        await client.waitForTransactionReceipt({ hash });
      } finally {
        await rawRpc("anvil_stopImpersonatingAccount", [asset.aToken.address]);
      }
      const program = {
        version: 1,
        requestId: "550e8400-e29b-41d4-a716-446655440088",
        chainId: 196,
        policyHash: `0x${"11".repeat(32)}`,
        manifestHash: registryHash,
        owner,
        executor,
        pinnedBlock: { number: anchor.number.toString(), hash: anchor.hash },
        deadline: Number(anchor.timestamp) + 300,
        nonce: `0x${"22".repeat(32)}`,
        input: { token: asset.underlying.address, atomic: AMOUNT.toString() },
        actions: [{
          capabilityId: "aave-v3.supply",
          capabilityVersion: 1,
          valueAtomic: "0",
          parameters: { asset: asset.underlying.address, amountAtomic: AMOUNT.toString() },
        }],
        constraints: [{
          token: asset.aToken.address,
          account: owner,
          minimumIncreaseAtomic: (AMOUNT - 1n).toString(),
        }],
      } satisfies CapabilityProgramV1;
      const parameters = aaveSupplyCapabilityV1.parseParameters(program.actions[0].parameters);
      const compiled = aaveSupplyCapabilityV1.compile({
        program,
        actionIndex: 0,
        parameters,
        manifest: productionCapabilityManifestV1(),
      });
      const result = await replayCapabilityProgramOnForkV1({
        program,
        compiled: [compiled],
        forkRpc: rawRpc,
        read: {
          getChainId: () => client.getChainId(),
          getBlock: (number) => client.getBlock({ blockNumber: number }),
          getBalanceOf: (token, account) => client.readContract({
            address: token,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [account],
          }),
          waitForReceipt: async (hash) => {
            const receipt = await client.waitForTransactionReceipt({ hash });
            return {
              status: receipt.status,
              transactionHash: receipt.transactionHash,
              logs: receipt.logs,
            };
          },
          getCodeHash: async (address) => {
            const code = await client.getCode({ address });
            if (!code) throw new Error("Fork target has no code");
            return keccak256(code);
          },
          getImplementation: async (address) => {
            const word = await client.getStorageAt({
              address,
              slot: EIP1967_IMPLEMENTATION_SLOT,
            });
            if (!word || /^0x0+$/.test(word)) return undefined;
            const implementation = getAddress(`0x${word.slice(-40)}`) as Address;
            const code = await client.getCode({ address: implementation });
            if (!code) throw new Error("Fork implementation has no code");
            return { address: implementation, runtimeCodeHash: keccak256(code) };
          },
        },
      });
      expect(result.reproduced).toBe(true);
      expect(BigInt(result.balanceDeltas[0]!.afterAtomic) -
        BigInt(result.balanceDeltas[0]!.beforeAtomic)).toBeGreaterThanOrEqual(AMOUNT - 1n);
      expect(result.stateDiffHash).toBe(commitment(result.balanceDeltas));
    } finally {
      await fork.stop();
    }
  });
});
