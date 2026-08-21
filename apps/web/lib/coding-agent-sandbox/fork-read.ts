import {
  decodeFunctionResult,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  isHash,
  isHex,
  keccak256,
  toHex,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { EIP1967_IMPLEMENTATION_SLOT } from "../adapters/read-client";
import type { CapabilityForkReplayReadV2 } from "./capability-fork-replay-v2";

export function createForkRead(
  rpc: (method: string, params?: readonly unknown[]) => Promise<unknown>,
): CapabilityForkReplayReadV2 {
  const balanceOf = async (token: Address, account: Address) => {
    const result = await rpc("eth_call", [{
      to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [account] }),
    }, "latest"]);
    if (typeof result !== "string") throw new Error("Fork balance response is invalid");
    return decodeFunctionResult({ abi: erc20Abi, functionName: "balanceOf", data: result as Hex });
  };
  const codeHash = async (address: Address) => {
    const code = await rpc("eth_getCode", [address, "latest"]);
    if (typeof code !== "string" || code === "0x") throw new Error("Fork target has no code");
    return keccak256(code as Hex);
  };
  return {
    getChainId: async () => Number(BigInt(String(await rpc("eth_chainId")))),
    getBlock: async (number) => {
      const value = await rpc("eth_getBlockByNumber", [`0x${number.toString(16)}`, false]) as { hash?: Hash };
      return { ...(value.hash && isHash(value.hash) ? { hash: value.hash } : {}) };
    },
    getBalanceOf: balanceOf,
    async staticCall({ target, data, gasLimit }) {
      const result = await rpc("eth_call", [{ to: target, data, gas: toHex(gasLimit) }, "latest"]);
      if (typeof result !== "string" || !isHex(result)) throw new Error("Fork static call response is invalid");
      return result;
    },
    async waitForReceipt(hash) {
      for (let attempt = 0; attempt < 100; ++attempt) {
        const receipt = await rpc("eth_getTransactionReceipt", [hash]) as null | {
          status: Hex; transactionHash: Hash;
          logs: { address: Address; data: Hex; topics: Hash[] }[];
        };
        if (receipt) return {
          status: BigInt(receipt.status) === 1n ? "success" : "reverted",
          transactionHash: receipt.transactionHash,
          logs: receipt.logs,
        };
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error("Fork transaction receipt timed out");
    },
    getCodeHash: codeHash,
    async getImplementation(address) {
      const word = await rpc("eth_getStorageAt", [address, EIP1967_IMPLEMENTATION_SLOT, "latest"]);
      if (typeof word !== "string" || /^0x0+$/.test(word)) return undefined;
      const implementation = getAddress(`0x${word.slice(-40)}`);
      return { address: implementation, runtimeCodeHash: await codeHash(implementation) };
    },
  };
}
