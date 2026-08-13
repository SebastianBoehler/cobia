import type { CodingAgentSandboxV1 } from "@cobia/solvers";
import { describe, expect, it, vi } from "vitest";
import { runOpenAiSandboxCodingAgent } from "./openai-shell-agent";

function sandbox(): CodingAgentSandboxV1 {
  return {
    writeFile: vi.fn(),
    readFile: vi.fn(),
    stop: vi.fn(),
    run: vi.fn(async ({ args }) => ({
      exitCode: args[1] === "false" ? 1 : 0,
      stdout: `stdout:${args[1]}`,
      stderr: args[1] === "false" ? "failed" : "",
    })),
  };
}

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("OpenAI local-shell coding loop", () => {
  it("executes model shell calls only inside the supplied disposable sandbox", async () => {
    const agent = sandbox();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({
        id: "resp_1",
        status: "completed",
        output: [{
          type: "shell_call",
          call_id: "call_1",
          action: { commands: ["pwd", "false"], timeout_ms: 120_000, max_output_length: 4096 },
        }],
      }))
      .mockResolvedValueOnce(response({ id: "resp_2", status: "completed", output: [] }));

    const result = await runOpenAiSandboxCodingAgent({
      apiKey: "model-secret",
      model: "gpt-5.6",
      sandbox: agent,
      fetcher,
    });

    expect(agent.run).toHaveBeenNthCalledWith(1, {
      cmd: "bash", args: ["-lc", "pwd"], timeoutMs: 60_000,
    });
    expect(agent.run).toHaveBeenNthCalledWith(2, {
      cmd: "bash", args: ["-lc", "false"], timeoutMs: 60_000,
    });
    expect(result).toMatchObject({ responseIds: ["resp_1", "resp_2"], commandCount: 2 });
    const firstRequest = fetcher.mock.calls[0] as [string, RequestInit];
    expect(firstRequest[1].headers).toMatchObject({ Authorization: "Bearer model-secret" });
    const bodies = fetcher.mock.calls.map((call) => call[1]?.body as string).join("\n");
    expect(bodies).not.toContain("model-secret");
    expect(bodies).not.toContain("privateKey");
    expect(JSON.parse(fetcher.mock.calls[1]![1]!.body as string).input)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        type: "shell_call_output",
        call_id: "call_1",
        output: [
          expect.objectContaining({ outcome: { type: "exit", exit_code: 0 } }),
          expect.objectContaining({ outcome: { type: "exit", exit_code: 1 } }),
        ],
      })]));
  });

  it("fails closed on command-count abuse and never runs the excess command", async () => {
    const agent = sandbox();
    const commands = Array.from({ length: 65 }, (_, index) => `echo ${index}`);
    const fetcher = vi.fn().mockResolvedValue(response({
      id: "resp_abuse",
      status: "completed",
      output: [{ type: "shell_call", call_id: "call_abuse", action: { commands } }],
    }));
    await expect(runOpenAiSandboxCodingAgent({
      apiKey: "secret", model: "gpt-5.6", sandbox: agent, fetcher,
    })).rejects.toThrow("command limit");
    expect(agent.run).not.toHaveBeenCalled();
  });

  it("rejects a non-completed terminal response", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({
      id: "resp_bad", status: "incomplete", output: [],
    }));
    await expect(runOpenAiSandboxCodingAgent({
      apiKey: "secret", model: "gpt-5.6", sandbox: sandbox(), fetcher,
    })).rejects.toThrow("did not complete");
  });
});
