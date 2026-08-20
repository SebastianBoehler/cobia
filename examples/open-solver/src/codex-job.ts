import type { SolverIntentV1 } from "@cobia/solver-sdk";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface CodexJob {
  cwd: string;
  intentPath: string;
  decisionPath: string;
  prompt: string;
}

function guidance() {
  return `# Cobia solver job

Solve only the signed intent in \`intent.json\`.

- You are running as a non-interactive Codex worker inside Docker.
- Use the installed Cobia skills when relevant.
- Use the Cobia route MCP tools for canonical registry facts, quotes, program construction, and optional simulation.
- Explicitly supported protocols have semantic skills and adapters, but they are not an allowlist. You may research another protocol and use the exact-call lane when it satisfies the signed policy.
- Simulation is optional research. Cobia independently verifies every submitted candidate.
- Do not request or search for wallet keys, solver keys, or transaction-send methods.
- Finish with one structured response whose \`decisionJson\` string contains exactly one schema-valid SolverDecisionV1. The host validates it and writes \`decision.json\`.
- Submit only when the complete program satisfies the signed policy; otherwise use a precise abstention code.
- A canonical abstention is \`{"version":1,"decision":"abstain","reasonCode":"NO_SUPPORTED_REFERENCE_ROUTE"}\`.
`;
}

export async function prepareCodexJob(input: {
  root: string;
  intent: SolverIntentV1;
  skillsSource: string;
}): Promise<CodexJob> {
  const cwd = join(input.root, input.intent.id);
  const skills = join(cwd, ".agents", "skills");
  const intentPath = join(cwd, "intent.json");
  const decisionPath = join(cwd, "decision.json");
  await mkdir(join(cwd, ".agents"), { recursive: true, mode: 0o700 });
  await rm(skills, { recursive: true, force: true });
  await symlink(input.skillsSource, skills, "dir");
  await writeFile(intentPath, `${JSON.stringify(input.intent, null, 2)}\n`, { mode: 0o600 });
  await writeFile(join(cwd, "AGENTS.md"), guidance(), { mode: 0o600 });
  return {
    cwd,
    intentPath,
    decisionPath,
    prompt: "Use the cobia-intent skill to solve intent.json. First call the Cobia capability tool, " +
      "then call the Cobia solve tool for the exact signed intent attached to this job. Inspect its " +
      "canonical decision against the signed policy and return " +
      '`{"decisionJson":"<canonical SolverDecisionV1 serialized as a JSON string>"}`. ' +
      "You may research other protocols and use the exact-call route tool. Never invent evidence. " +
      "If no complete candidate satisfies the intent, return a schema-valid canonical abstention.",
  };
}
