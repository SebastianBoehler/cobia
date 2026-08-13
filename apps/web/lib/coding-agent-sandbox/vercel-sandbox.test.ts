import { describe, expect, it } from "vitest";
import { startVercelCodingAgentSandbox } from "./vercel-sandbox";

describe("Vercel coding-agent sandbox", () => {
  it("creates a non-persistent microVM with only the broker and documented source hosts", async () => {
    let options: unknown;
    const sandbox = await startVercelCodingAgentSandbox({
      jobId: "550e8400-e29b-41d4-a716-446655440000",
      brokerUrl: "https://broker.cobia.example/rpc",
      create: async (input) => {
        options = input;
        return {
          writeFiles: async () => undefined,
          runCommand: async () => ({ exitCode: 0, stdout: async () => "", stderr: async () => "" }),
          readFileToBuffer: async () => Buffer.from("{}"),
          stop: async () => undefined,
        };
      },
    });

    expect(options).toMatchObject({
      name: "cobia-550e8400-e29b-41d4-a716-446655440000",
      runtime: "node24",
      persistent: false,
      timeout: 300_000,
      resources: { vcpus: 2 },
      env: { COBIA_READ_RPC_BROKER_URL: "https://broker.cobia.example/rpc" },
      networkPolicy: { allow: expect.objectContaining({
        "registry.npmjs.org": [{ match: { method: ["GET"] } }],
        "github.com": [{ match: { method: ["GET"] } }],
        "broker.cobia.example": [expect.objectContaining({
          match: { method: ["POST"], path: { exact: "/rpc" } },
          forwardURL: "https://broker.cobia.example/rpc",
        })],
      }) },
    });
    const serialized = JSON.stringify(options);
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("apiKey");
    expect(serialized).not.toContain('"*"');
    await sandbox.stop();
  });

  it("marks symlinked artifacts so the core runner refuses them", async () => {
    const sandbox = await startVercelCodingAgentSandbox({
      jobId: "550e8400-e29b-41d4-a716-446655440000",
      brokerUrl: "https://broker.cobia.example/rpc",
      create: async () => ({
        writeFiles: async () => undefined,
        runCommand: async ({ args }: { args?: string[] }) => ({
          exitCode: args?.[0] === "-L" ? 0 : 1,
          stdout: async () => "",
          stderr: async () => "",
        }),
        readFileToBuffer: async () => Buffer.from("{}"),
        stop: async () => undefined,
      }),
    });
    await expect(sandbox.readFile("out/proposal.json")).resolves.toEqual({
      content: "{}",
      isSymbolicLink: true,
    });
  });
});
