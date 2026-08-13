import type { CodingAgentSandboxV1 } from "@cobia/solvers";
import { z } from "zod";

const MAX_TURNS = 24;
const MAX_COMMANDS = 64;
const MAX_COMMAND_MS = 60_000;
const MAX_OUTPUT = 8_192;

const ShellCallSchema = z.object({
  type: z.literal("shell_call"),
  call_id: z.string().min(1),
  action: z.object({
    commands: z.array(z.string().min(1).max(16_384)).min(1),
    timeout_ms: z.number().int().positive().optional(),
    max_output_length: z.number().int().positive().optional(),
  }).passthrough(),
}).passthrough();

const ResponseSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  output: z.array(z.unknown()),
}).passthrough();

function clipped(value: string, maximum: number): string {
  if (value.length <= maximum) return value;
  return `${value.slice(0, maximum)}\n[truncated]`;
}

const instructions = [
  "You are Cobia's route research coding agent inside a disposable X Layer laboratory.",
  "Use the local shell freely to inspect in/task.json, write TypeScript/JavaScript, install pinned packages, retrieve allowed official docs/source, and query the credential-free pinned read broker.",
  "You have no wallet key, signing API, browser wallet, production transaction API, or mainnet send method.",
  "Author only the canonical capability program and complete reproducible evidence files requested by in/task.json.",
  "Never emit raw production authorization. Never claim safety; an independent verifier decides.",
  "Finish by writing out/program.json, out/evidence.json, and out/run-manifest.json.",
].join(" ");

function requestBody(model: string, input: unknown[]) {
  return {
    model,
    store: false,
    max_output_tokens: 4_096,
    instructions,
    input,
    tools: [{ type: "shell", environment: { type: "local" } }],
    tool_choice: "auto",
  };
}

export async function runOpenAiSandboxCodingAgent(input: {
  apiKey: string;
  model: string;
  sandbox: CodingAgentSandboxV1;
  fetcher?: typeof fetch;
}): Promise<{ responseIds: string[]; commandCount: number }> {
  const fetcher = input.fetcher ?? fetch;
  const conversation: unknown[] = [{
    role: "user",
    content: "Solve the intent in in/task.json. Use shell tools until all required output files exist.",
  }];
  const responseIds: string[] = [];
  let commandCount = 0;

  for (let turn = 0; turn < MAX_TURNS; ++turn) {
    const response = await fetcher("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody(input.model, conversation)),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) throw new Error(`Coding-agent model request failed (${response.status})`);
    const parsed = ResponseSchema.parse(await response.json());
    responseIds.push(parsed.id);
    conversation.push(...parsed.output);
    const calls = parsed.output.flatMap((item) => {
      const call = ShellCallSchema.safeParse(item);
      return call.success ? [call.data] : [];
    });
    if (calls.length === 0) {
      if (parsed.status !== "completed") throw new Error("Coding-agent model did not complete");
      return { responseIds, commandCount };
    }
    const turnCommands = calls.reduce((total, call) => total + call.action.commands.length, 0);
    if (commandCount + turnCommands > MAX_COMMANDS) {
      throw new Error("Coding-agent shell command limit exceeded");
    }
    for (const call of calls) {
      const maximum = Math.min(call.action.max_output_length ?? MAX_OUTPUT, MAX_OUTPUT);
      const outputs = [];
      for (const command of call.action.commands) {
        const result = await input.sandbox.run({
          cmd: "bash",
          args: ["-lc", command],
          timeoutMs: Math.min(call.action.timeout_ms ?? MAX_COMMAND_MS, MAX_COMMAND_MS),
        });
        ++commandCount;
        outputs.push({
          stdout: clipped(result.stdout, maximum),
          stderr: clipped(result.stderr, maximum),
          outcome: { type: "exit", exit_code: result.exitCode },
        });
      }
      conversation.push({
        type: "shell_call_output",
        call_id: call.call_id,
        max_output_length: maximum,
        output: outputs,
      });
    }
  }
  throw new Error("Coding-agent model turn limit exceeded");
}
