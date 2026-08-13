import { describe, expect, it, vi } from "vitest";
import { startVercelAnvilForkV1 } from "./vercel-anvil-fork";

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
      runtime: "node24", persistent: false, networkPolicy: { allow: {
        "registry.npmjs.org": [],
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
});
