import { Sandbox } from "@vercel/sandbox";
import { decodeFunctionResult, encodeFunctionData, erc20Abi, getAddress, isHash, isHex, keccak256, toHex } from "viem";
import type { Address, Hash, Hex } from "viem";
import { EIP1967_IMPLEMENTATION_SLOT } from "../adapters/read-client";
import type { CapabilityForkReplayReadV2 } from "./capability-fork-replay-v2";

const ANVIL_VERSION = "1.7.1";
export const FORK_REPLAY_SANDBOX_TIMEOUT_MS = 100_000;
const RPC_SCRIPT = [
  "const [body] = process.argv.slice(1);",
  "const response = await fetch('http://127.0.0.1:8545',{method:'POST',headers:{'content-type':'application/json'},body});",
  "process.stdout.write(await response.text());",
].join("");

type CommandResult = { exitCode: number; stdout(): Promise<string>; stderr(): Promise<string> };
type SandboxHandle = {
  runCommand(input: {
    cmd: string; args?: string[]; timeoutMs?: number; detached?: boolean;
  }): Promise<CommandResult | unknown>;
  stop(): Promise<void>;
};
type Options = Parameters<typeof Sandbox.create>[0];

function parsedResult(body: string): unknown {
  const value = JSON.parse(body) as { result?: unknown; error?: { message?: string } };
  if (value.error) throw new Error(value.error.message ?? "Anvil RPC failed");
  return value.result;
}

async function finished(value: unknown): Promise<CommandResult> {
  const result = value as Partial<CommandResult>;
  if (typeof result.exitCode !== "number" || !result.stdout || !result.stderr) {
    throw new Error("Sandbox command did not finish");
  }
  return result as CommandResult;
}

export async function startVercelAnvilForkV1(input: {
  jobId: string;
  brokerUrl: string;
  blockNumber: string;
  create?: (options: NonNullable<Options>) => Promise<SandboxHandle>;
}) {
  const broker = new URL(input.brokerUrl);
  if (broker.protocol !== "https:" || broker.username || broker.password) {
    throw new Error("Fork broker must be a credential-free HTTPS URL");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(input.jobId) ||
    !/^[1-9][0-9]*$/.test(input.blockNumber)) {
    throw new Error("Fork replay identity is invalid");
  }
  const options = {
    name: `cobia-replay-${input.jobId}`,
    runtime: "node24" as const,
    timeout: FORK_REPLAY_SANDBOX_TIMEOUT_MS,
    persistent: false,
    resources: { vcpus: 2 },
    networkPolicy: { allow: {
      "registry.npmjs.org": [{ match: { method: ["GET"] }, transform: [] }],
      [broker.hostname]: [{
        match: { method: ["POST"], path: { exact: broker.pathname } },
        forwardURL: input.brokerUrl,
      }],
    } },
  } satisfies NonNullable<Options>;
  const create = input.create ?? (async (value) => Sandbox.create(value) as Promise<unknown> as Promise<SandboxHandle>);
  const sandbox = await create(options);
  let id = 0;
  const rpc = async (method: string, params: readonly unknown[] = []) => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params });
    const result = await finished(await sandbox.runCommand({
      cmd: "node", args: ["--input-type=module", "-e", RPC_SCRIPT, body], timeoutMs: 15_000,
    }));
    if (result.exitCode !== 0) throw new Error(`Anvil RPC command failed: ${await result.stderr()}`);
    return parsedResult(await result.stdout());
  };
  try {
    const installed = await finished(await sandbox.runCommand({
      cmd: "npm", args: ["install", "--no-save", `@foundry-rs/anvil@${ANVIL_VERSION}`], timeoutMs: 60_000,
    }));
    if (installed.exitCode !== 0) throw new Error(`Anvil installation failed: ${await installed.stderr()}`);
    await sandbox.runCommand({
      cmd: "./node_modules/.bin/anvil",
      args: [
        "--fork-url", input.brokerUrl,
        "--fork-block-number", input.blockNumber,
        "--chain-id", "196", "--port", "8545", "--silent",
      ],
      detached: true,
      timeoutMs: 90_000,
    });
    let ready = false;
    for (let attempt = 0; attempt < 20; ++attempt) {
      try {
        if (await rpc("eth_chainId") === "0xc4") {
          ready = true;
          break;
        }
      } catch {
        // Retried below; the detached Anvil process may still be starting.
      }
      if (attempt < 19) await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!ready) throw new Error("Anvil fork did not become ready");
  } catch (error) {
    await sandbox.stop();
    throw error;
  }
  return { rpc, stop: () => sandbox.stop(), read: createForkRead(rpc) };
}

export const startVercelAnvilForkV2 = startVercelAnvilForkV1;

export function createForkRead(rpc: (method: string, params?: readonly unknown[]) => Promise<unknown>): CapabilityForkReplayReadV2 {
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
