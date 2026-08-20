import type { SolverIntentV1 } from "@cobia/solver-sdk";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface CodexJob {
  cwd: string;
  intentPath: string;
  decisionPath: string;
  prompt: string;
}

function guidance(toolCommand: string) {
  return `# Cobia solver job

Solve only the signed intent in \`intent.json\`.

- Use the installed Cobia skills when relevant.
- Use \`${toolCommand}\` for canonical registry facts, quotes, program construction, and optional simulation.
- Simulation is optional research. Cobia independently verifies every submitted candidate.
- Do not request or search for wallet keys, solver keys, or transaction-send methods.
- Finish by writing exactly one schema-valid SolverDecisionV1 to \`decision.json\`.
- Submit only when the complete program satisfies the signed policy; otherwise use a precise abstention code.
`;
}

export async function prepareCodexJob(input: {
  root: string;
  intent: SolverIntentV1;
  skillsSource: string;
  toolCommand: readonly string[];
}): Promise<CodexJob> {
  const cwd = join(input.root, input.intent.id);
  const skills = join(cwd, ".agents", "skills");
  const intentPath = join(cwd, "intent.json");
  const decisionPath = join(cwd, "decision.json");
  const toolCommand = input.toolCommand.join(" ");
  await mkdir(join(cwd, ".agents"), { recursive: true, mode: 0o700 });
  await rm(skills, { recursive: true, force: true });
  await symlink(input.skillsSource, skills, "dir");
  await writeFile(intentPath, `${JSON.stringify(input.intent, null, 2)}\n`, { mode: 0o600 });
  await writeFile(join(cwd, "AGENTS.md"), guidance(toolCommand), { mode: 0o600 });
  return {
    cwd,
    intentPath,
    decisionPath,
    prompt: `Use the cobia-intent skill to solve intent.json. Start with \`${toolCommand} capabilities\`. ` +
      `Then run \`${toolCommand} solve --intent intent.json --output candidate.json\`. ` +
      "Inspect candidate.json against the signed policy and return its exact JSON as your structured final response. " +
      "You may abstain with a more precise canonical reason when the candidate does not satisfy the complete intent.",
  };
}
