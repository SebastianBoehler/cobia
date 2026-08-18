import { Sandbox } from "@vercel/sandbox";
import type { CodingAgentSandboxV1 } from "@cobia/solvers";

export const CODING_AGENT_SANDBOX_TIMEOUT_MS = 170_000;
const SANDBOX_SOURCE_HOSTS = [
  "registry.npmjs.org",
  "github.com",
  "raw.githubusercontent.com",
  "developers.uniswap.org",
  "aave.com",
] as const;
const MAX_ARTIFACT_BYTES = 1_048_576;
const SAFE_WORKSPACE_PATH = /^(?:[a-zA-Z0-9][a-zA-Z0-9._-]*\/)*[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const READ_ARTIFACT_SCRIPT = [
  "import { constants } from 'node:fs';",
  "import { open } from 'node:fs/promises';",
  "const [path,maximum]=process.argv.slice(1);",
  "try{const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);",
  "try{const stat=await file.stat();",
  "if(!stat.isFile()||stat.size>Number(maximum))throw new Error('Artifact is not a bounded regular file');",
  "process.stdout.write((await file.readFile()).toString('base64'));",
  "}finally{await file.close();}}catch(error){process.stderr.write(error instanceof Error?error.message:String(error));process.exitCode=73;}",
].join("");

interface NetworkRule {
  match: { method: string[]; path?: { exact: string } };
  forwardURL?: string;
  transform?: [];
}

type SandboxHandle = {
  writeFiles(files: { path: string; content: string }[]): Promise<void>;
  runCommand(input: { cmd: string; args?: string[]; timeoutMs?: number }): Promise<{
    exitCode: number;
    stdout(): Promise<string>;
    stderr(): Promise<string>;
  }>;
  stop(): Promise<void>;
};

interface VercelSandboxOptions {
  name: string;
  runtime: "node24";
  timeout: number;
  persistent: false;
  resources: { vcpus: 2 };
  networkPolicy: { allow: Record<string, NetworkRule[] | never[]> };
  env: { COBIA_READ_RPC_BROKER_URL: string };
}

export async function startVercelCodingAgentSandbox(input: {
  jobId: string;
  brokerUrl: string;
  create?: (options: VercelSandboxOptions) => Promise<SandboxHandle>;
}): Promise<CodingAgentSandboxV1> {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(input.jobId)) {
    throw new Error("Coding-agent job ID is invalid");
  }
  const broker = new URL(input.brokerUrl);
  if (broker.protocol !== "https:" || broker.username || broker.password) {
    throw new Error("Coding-agent broker must be a credential-free HTTPS URL");
  }
  const options: VercelSandboxOptions = {
    name: `cobia-${input.jobId.toLowerCase()}`,
    runtime: "node24",
    timeout: CODING_AGENT_SANDBOX_TIMEOUT_MS,
    persistent: false,
    resources: { vcpus: 2 },
    networkPolicy: {
      allow: {
        ...Object.fromEntries(SANDBOX_SOURCE_HOSTS.map((host) => [host, [{
          match: { method: ["GET"] },
          transform: [],
        }]])),
        [broker.hostname]: [{
          match: { method: ["POST"], path: { exact: broker.pathname } },
          forwardURL: input.brokerUrl,
        }],
      },
    },
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
      if (!SAFE_WORKSPACE_PATH.test(path) || path.split("/").includes("..")) {
        throw new Error("Coding-agent artifact must use a safe workspace path");
      }
      const result = await sandbox.runCommand({
        cmd: "node",
        args: ["--input-type=module", "-e", READ_ARTIFACT_SCRIPT, path, String(MAX_ARTIFACT_BYTES)],
        timeoutMs: 5_000,
      });
      if (result.exitCode !== 0) {
        throw new Error(`Coding-agent artifact read failed: ${await result.stderr()}`);
      }
      const encoded = await result.stdout();
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
        throw new Error("Coding-agent artifact read returned invalid encoding");
      }
      return { content: Buffer.from(encoded, "base64").toString("utf8"), isSymbolicLink: false };
    },
    stop: async () => { await sandbox.stop(); },
  };
}
