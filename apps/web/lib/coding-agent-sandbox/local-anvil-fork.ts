import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { createForkRead } from "./fork-read";

const leasedPorts = new Set<number>();
const ANVIL_READY_ATTEMPTS = 240;
const ANVIL_READY_POLL_MS = 250;

export async function reserveLocalAnvilPort() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const port = await new Promise<number>((resolve, reject) => {
      const server = createServer();
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        const selected = typeof address === "object" && address ? address.port : 0;
        server.close((error) => error ? reject(error) : resolve(selected));
      });
    });
    if (port > 0 && !leasedPorts.has(port)) {
      leasedPorts.add(port);
      return { port, release: () => { leasedPorts.delete(port); } };
    }
  }
  throw new Error("A local Anvil port could not be reserved");
}

function result(body: unknown) {
  const value = body as { result?: unknown; error?: { message?: string } };
  if (value.error) throw new Error(value.error.message ?? "Local Anvil RPC failed");
  return value.result;
}

export async function startLocalAnvilFork(input: {
  upstreamRpc: string;
  blockNumber: string;
  port?: number;
  chainId?: 1 | 196 | 8453;
}) {
  const chainId = input.chainId ?? 196;
  const reservation = input.port === undefined ? await reserveLocalAnvilPort() : undefined;
  const port = input.port ?? reservation!.port;
  const anvil = process.env.ANVIL_BIN ?? fileURLToPath(new URL("../../node_modules/.bin/anvil", import.meta.url));
  const child = spawn(anvil, [
    "--fork-url", input.upstreamRpc,
    "--fork-block-number", input.blockNumber,
    "--chain-id", chainId.toString(),
    "--port", port.toString(),
    "--silent",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => { stderr += String(chunk).slice(0, 4_096); });
  let requestId = 0;
  const endpoint = `http://127.0.0.1:${port}`;
  const rpc = async (method: string, params: readonly unknown[] = []) => {
    const response = await fetch(endpoint, { method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method, params }) });
    if (!response.ok) throw new Error(`Local Anvil returned HTTP ${response.status}`);
    return result(await response.json());
  };
  let ready = false;
  for (let attempt = 0; attempt < ANVIL_READY_ATTEMPTS; attempt += 1) {
    if (child.exitCode !== null) {
      reservation?.release();
      throw new Error(`Local Anvil exited: ${stderr}`);
    }
    try {
      if (Number(BigInt(String(await rpc("eth_chainId")))) === chainId) { ready = true; break; }
    } catch { /* Anvil is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, ANVIL_READY_POLL_MS));
  }
  if (!ready) {
    child.kill("SIGTERM");
    reservation?.release();
    throw new Error(`Local Anvil did not become ready: ${stderr}`);
  }
  return {
    rpc,
    read: createForkRead(rpc),
    async stop() {
      try {
        if (child.exitCode === null) {
          child.kill("SIGTERM");
          await Promise.race([
            new Promise<void>((resolve) => child.once("exit", () => resolve())),
            new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
          ]);
          if (child.exitCode === null) child.kill("SIGKILL");
        }
      } finally { reservation?.release(); }
    },
  };
}
