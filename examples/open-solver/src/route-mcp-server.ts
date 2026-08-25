import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { SolverDecisionV1Schema, type SolverIntentV1 } from "@cobia/solver-sdk";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { REFERENCE_CAPABILITY_DECLARATION } from "./route-tool";
import { solve } from "./strategy";
import { preflightXLayerTransaction } from "./transaction-decision";

function requiredOption(args: readonly string[], name: string) {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`Route MCP requires ${name}`);
  return value;
}

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

const intentPath = requiredOption(process.argv.slice(2), "--intent");
const intent = JSON.parse(await readFile(intentPath, "utf8")) as SolverIntentV1;

serveStdio(() => {
  const server = new McpServer({ name: "cobia-route", version: "1.0.0" }, {
    capabilities: { tools: {} },
  });
  server.registerTool("capabilities", {
    title: "Cobia supported capabilities",
    description: "List curated semantic adapters. This is not a protocol allowlist.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, async () => result(REFERENCE_CAPABILITY_DECLARATION));
  server.registerTool("intent", {
    title: "Read the signed Cobia intent",
    description: "Return this agentic solver's immutable signed intent and frozen evidence.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, async () => result(intent));
  server.registerTool("solve", {
    title: "Build a supported Cobia candidate",
    description: "Construct a canonical decision for this MCP server's immutable signed intent.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, async () => result(SolverDecisionV1Schema.parse(await solve(intent))));
  server.registerTool("replay", {
    title: "Preflight a Cobia transaction candidate",
    description: "Optionally fork-replay a complete transaction candidate before submission.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    inputSchema: z.object({ decisionJson: z.string().min(2) }).strict(),
  }, async ({ decisionJson }) => result(await preflightXLayerTransaction(
    intent, SolverDecisionV1Schema.parse(JSON.parse(decisionJson)),
  )));
  server.registerTool("exact_call", {
    title: "Validate an open-lane exact-call candidate",
    description: "Validate a transaction-program candidate researched by the solver before returning it.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    inputSchema: z.object({ decisionJson: z.string().min(2) }).strict(),
  }, async ({ decisionJson }) => {
    const decision = SolverDecisionV1Schema.parse(JSON.parse(decisionJson));
    if (decision.decision !== "submit") {
      throw new Error("Open lane requires a canonical submitted program");
    }
    return result(decision);
  });
  return server;
});
