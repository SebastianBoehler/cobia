import { describe, expect, it, vi } from "vitest";
import { startVercelAnvilForkV1, startVercelAnvilForkV2 } from "./vercel-anvil-fork";

describe("trusted Vercel Anvil fork", () => {
  it("installs a pinned Anvil and exposes RPC only through sandbox commands", async () => {
    const commands: unknown[] = [];
    let options: unknown;
    const fork = await startVercelAnvilForkV1({
      jobId: "550e8400-e29b-41d4-a716-446655440000",
      brokerUrl: "https://cobia.example/api/internal/coding-agent/rpc/550e8400-e29b-41d4-a716-446655440000",
      blockNumber: "123",
      create: async (input) => {
        options = input;
        return {
          runCommand: vi.fn(async (command) => {
            commands.push(command);
            const last = command.args?.at(-1);
            if (command.cmd === "node" && typeof last === "string") {
              const request = JSON.parse(last) as { id: number; method: string };
              return {
                exitCode: 0,
                stdout: async () => JSON.stringify({ jsonrpc: "2.0", id: request.id, result: "0xc4" }),
                stderr: async () => "",
              };
            }
            return { exitCode: 0, stdout: async () => "", stderr: async () => "" };
          }),
          stop: vi.fn(async () => undefined),
        };
      },
    });
    await expect(fork.rpc("eth_chainId")).resolves.toBe("0xc4");
    expect(options).toMatchObject({
      name: "cobia-replay-550e8400-e29b-41d4-a716-446655440000",
      runtime: "node24", timeout: 100_000, persistent: false, networkPolicy: { allow: {
        "registry.npmjs.org": [{ match: { method: ["GET"] }, transform: [] }],
        "cobia.example": [expect.objectContaining({ forwardURL: expect.any(String) })],
      } },
    });
    expect(commands).toEqual(expect.arrayContaining([
      expect.objectContaining({ cmd: "npm", args: expect.arrayContaining(["@foundry-rs/anvil@1.7.1"]) }),
      expect.objectContaining({ cmd: "./node_modules/.bin/anvil", detached: true }),
    ]));
    expect(JSON.stringify(options)).not.toContain("credential");
    await fork.stop();
  });

  it.each([
    "http://cobia.example/rpc",
    "https://user:secret@cobia.example/rpc",
  ])("rejects an unsafe fork broker URL before creating a sandbox", async (brokerUrl) => {
    const create = vi.fn();
    await expect(startVercelAnvilForkV1({
      jobId: "550e8400-e29b-41d4-a716-446655440000",
      brokerUrl,
      blockNumber: "123",
      create,
    })).rejects.toThrow("credential-free HTTPS");
    expect(create).not.toHaveBeenCalled();
  });

  it("stops and rejects a fork that answers with the wrong chain", async () => {
    const stop = vi.fn(async () => undefined);
    await expect(startVercelAnvilForkV1({
      jobId: "550e8400-e29b-41d4-a716-446655440000",
      brokerUrl: "https://cobia.example/api/internal/coding-agent/rpc/550e8400-e29b-41d4-a716-446655440000",
      blockNumber: "123",
      create: async () => ({
        runCommand: vi.fn(async (command) => {
          const last = command.args?.at(-1);
          return command.cmd === "node" && typeof last === "string"
            ? { exitCode: 0, stdout: async () => JSON.stringify({ result: "0x1" }), stderr: async () => "" }
            : { exitCode: 0, stdout: async () => "", stderr: async () => "" };
        }),
        stop,
      }),
    })).rejects.toThrow("Anvil fork did not become ready");
    expect(stop).toHaveBeenCalledOnce();
  });

  it("performs bounded static reads against the disposable fork", async () => {
    const requests: { method: string; params: unknown[] }[] = [];
    const returnData = `0x${"0".repeat(63)}1` as const;
    const fork = await startVercelAnvilForkV2({
      jobId: "550e8400-e29b-41d4-a716-446655440000",
      brokerUrl: "https://cobia.example/api/internal/coding-agent/rpc/550e8400-e29b-41d4-a716-446655440000",
      blockNumber: "123",
      create: async () => ({
        runCommand: vi.fn(async (command) => {
          const last = command.args?.at(-1);
          if (command.cmd === "node" && typeof last === "string") {
            const request = JSON.parse(last) as { method: string; params: unknown[] };
            requests.push(request);
            return {
              exitCode: 0,
              stdout: async () => JSON.stringify({
                result: request.method === "eth_chainId" ? "0xc4" : returnData,
              }),
              stderr: async () => "",
            };
          }
          return { exitCode: 0, stdout: async () => "", stderr: async () => "" };
        }),
        stop: vi.fn(async () => undefined),
      }),
    });
    await expect(fork.read.staticCall({
      target: "0x1111111111111111111111111111111111111111",
      data: "0x12345678",
      gasLimit: 50_000,
    })).resolves.toBe(returnData);
    expect(requests.at(-1)).toMatchObject({
      method: "eth_call",
      params: [{
        to: "0x1111111111111111111111111111111111111111",
        data: "0x12345678",
        gas: "0xc350",
      }, "latest"],
    });
    await fork.stop();
  });
});
