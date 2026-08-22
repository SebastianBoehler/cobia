import type { SolverIntentV1 } from "@cobia/solver-sdk";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReferenceSolverConfig } from "./solver-config";

export interface CodexJob {
  cwd: string;
  intentPath: string;
  decisionPath: string;
  prompt: string;
}

type ExplorationSettings = Pick<ReferenceSolverConfig, "risk_level" |
  "max_codex_turns_per_intent" | "max_total_tokens_per_intent">;

function guidance(exploration: ExplorationSettings) {
  return `# Cobia solver job

Solve only the signed intent in \`intent.json\`.

- You are running as a non-interactive Codex worker inside Docker.
- Use the installed Cobia skills when relevant.
- The Cobia route MCP tools are already attached. Call only \`cobia_route.capabilities\`, \`cobia_route.solve\`, and, for a complete researched candidate, \`cobia_route.exact_call\`. Do not call MCP resource-discovery tools.
- Explicitly supported protocols have semantic skills and adapters, but they are not an allowlist. You may research another protocol and use the exact-call lane when it satisfies the signed policy.
- The configured risk level is ${exploration.risk_level}. You may spend up to ${exploration.max_codex_turns_per_intent} Codex turns and ${exploration.max_total_tokens_per_intent} total tokens on this intent.
- A supported-route abstention is a research checkpoint, not a final answer while exploration budget remains. Look for multi-hop routes, established external protocols, atomic compositions, and market inefficiencies appropriate to the configured risk level.
- Simulation is optional research. Cobia independently verifies every submitted candidate.
- Do not request or search for wallet keys, solver keys, or transaction-send methods.
- Your entire final response must be one structured object whose \`decisionJson\` string contains exactly one schema-valid SolverDecisionV1. Do not add prose or Markdown. Do not write decision.json; the host validates your final response and writes it.
- Submit only when the complete program satisfies the signed policy; otherwise use a precise abstention code.
- A canonical abstention is \`{"version":1,"decision":"abstain","reasonCode":"NO_SUPPORTED_REFERENCE_ROUTE"}\`.
`;
}

export async function prepareCodexJob(input: {
  root: string;
  intent: SolverIntentV1;
  skillsSource: string;
  exploration: ExplorationSettings;
}): Promise<CodexJob> {
  const cwd = join(input.root, input.intent.id);
  const skills = join(cwd, ".agents", "skills");
  const intentPath = join(cwd, "intent.json");
  const decisionPath = join(cwd, "decision.json");
  await mkdir(join(cwd, ".agents"), { recursive: true, mode: 0o700 });
  await rm(skills, { recursive: true, force: true });
  await symlink(input.skillsSource, skills, "dir");
  await writeFile(intentPath, `${JSON.stringify(input.intent, null, 2)}\n`, { mode: 0o600 });
  await writeFile(join(cwd, "AGENTS.md"), guidance(input.exploration), { mode: 0o600 });
  return {
    cwd,
    intentPath,
    decisionPath,
    prompt: "Solve intent.json as a non-interactive worker. Do not call MCP resource-discovery tools. " +
      "First call cobia_route.capabilities, then cobia_route.solve for the exact signed intent. Inspect its " +
      "canonical decision against the signed policy. Your entire final response must be " +
      '`{"decisionJson":"<canonical SolverDecisionV1 serialized as a JSON string>"}`. ' +
      `Risk level is ${input.exploration.risk_level}. If the supported solve abstains, use the ` +
      "remaining research budget to investigate other protocols, multi-hop paths, or atomic market " +
      "inefficiencies and validate a complete candidate through the exact-call lane. Never invent " +
      "evidence. Return an abstention only for this turn when no complete candidate has been found. " +
      "Do not write files, add prose, or continue after you have the final decision.",
  };
}
