import { Sandbox } from "@vercel/sandbox";
import type { CodingAgentSandboxV1 } from "@cobia/solvers";

const SANDBOX_TIMEOUT_MS = 300_000;
const SANDBOX_HOSTS = [
  "registry.npmjs.org",
  "github.com",
  "raw.githubusercontent.com",
  "developers.uniswap.org",
  "aave.com",
] as const;

type SandboxHandle = {
  writeFiles(files: { path: string; content: string }[]): Promise<void>;
  runCommand(input: { cmd: string; args?: string[]; timeoutMs?: number }): Promise<{
    exitCode: number;
    stdout(): Promise<string>;
    stderr(): Promise<string>;
  }>;
  readFileToBuffer(input: { path: string }): Promise<Buffer | null>;
  stop(): Promise<void>;
};

interface VercelSandboxOptions {
  runtime: "node24";
  timeout: number;
  persistent: false;
  resources: { vcpus: 2 };
  networkPolicy: { allow: string[] };
  env: { COBIA_READ_RPC_BROKER_URL: string };
}

export async function startVercelCodingAgentSandbox(input: {
  brokerUrl: string;
  create?: (options: VercelSandboxOptions) => Promise<SandboxHandle>;
}): Promise<CodingAgentSandboxV1> {
  const broker = new URL(input.brokerUrl);
  if (broker.protocol !== "https:" || broker.username || broker.password) {
    throw new Error("Coding-agent broker must be a credential-free HTTPS URL");
  }
  const options: VercelSandboxOptions = {
    runtime: "node24",
    timeout: SANDBOX_TIMEOUT_MS,
    persistent: false,
    resources: { vcpus: 2 },
    networkPolicy: { allow: [...SANDBOX_HOSTS, broker.hostname] },
    env: { COBIA_READ_RPC_BROKER_URL: input.brokerUrl },
  };
  const create = input.create ?? (async (value: VercelSandboxOptions) =>
    // Sandbox infers OIDC credentials at runtime on Vercel. Its generic type
    // cannot express that deployment-only credential source in this module.
    Sandbox.create(value as never) as Promise<unknown> as Promise<SandboxHandle>);
  const sandbox = await create(options);
  return {
    writeFile: (path, content) => sandbox.writeFiles([{ path, content }]),
    async run(command) {
      const result = await sandbox.runCommand({
        cmd: command.cmd,
        args: [...command.args],
        timeoutMs: command.timeoutMs,
      });
      return {
        exitCode: result.exitCode,
        stdout: await result.stdout(),
        stderr: await result.stderr(),
      };
    },
    async readFile(path) {
      const [link, content] = await Promise.all([
        sandbox.runCommand({ cmd: "test", args: ["-L", path], timeoutMs: 5_000 }),
        sandbox.readFileToBuffer({ path }),
      ]);
      if (!content) throw new Error(`Coding-agent artifact is missing: ${path}`);
      return { content: content.toString("utf8"), isSymbolicLink: link.exitCode === 0 };
    },
    stop: async () => { await sandbox.stop(); },
  };
}
