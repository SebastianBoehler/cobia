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
      timeout: 170_000,
      resources: { vcpus: 2 },
      env: { COBIA_READ_RPC_BROKER_URL: "https://broker.cobia.example/rpc" },
      networkPolicy: { allow: expect.objectContaining({
        "registry.npmjs.org": [{ match: { method: ["GET"] }, transform: [] }],
        "github.com": [{ match: { method: ["GET"] }, transform: [] }],
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

  it("refuses symlinked artifacts with one no-follow read", async () => {
    const sandbox = await startVercelCodingAgentSandbox({
      jobId: "550e8400-e29b-41d4-a716-446655440000",
      brokerUrl: "https://broker.cobia.example/rpc",
      create: async () => ({
        writeFiles: async () => undefined,
        runCommand: async () => ({
          exitCode: 73,
          stdout: async () => "",
          stderr: async () => "Artifact is not a regular file",
        }),
        readFileToBuffer: async () => Buffer.from("{}"),
        stop: async () => undefined,
      }),
    });
    await expect(sandbox.readFile("out/proposal.json")).rejects.toThrow("regular file");
  });

  it("rejects artifact traversal before invoking the sandbox", async () => {
    let commands = 0;
    const sandbox = await startVercelCodingAgentSandbox({
      jobId: "550e8400-e29b-41d4-a716-446655440000",
      brokerUrl: "https://broker.cobia.example/rpc",
      create: async () => ({
        writeFiles: async () => undefined,
        runCommand: async () => {
          ++commands;
          return { exitCode: 0, stdout: async () => "e30=", stderr: async () => "" };
        },
        readFileToBuffer: async () => Buffer.from("{}"),
        stop: async () => undefined,
      }),
    });
    await expect(sandbox.readFile("../secret")).rejects.toThrow("safe workspace path");
    expect(commands).toBe(0);
  });
});
