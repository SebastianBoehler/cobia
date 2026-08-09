import { commitment, type DecisionBundle, type MarketCandidate } from "@cobia/domain";
import type { LocalAccount } from "viem";
import { z } from "zod";
import { signBundle } from "./sign";
import type { Solver, SolverInput } from "./types";

const ResearchResultSchema = z.object({
  candidateId: z.string().min(1),
  allocationBps: z.number().int().min(0).max(10_000),
  evidence: z.array(z.object({
    url: z.string().url(),
    title: z.string().min(1),
    claim: z.string().min(1),
  }).strict()).min(1),
  riskFlags: z.array(z.object({
    candidateId: z.string().min(1),
    severity: z.enum(["low", "medium", "high", "critical"]),
    code: z.string().min(1),
    summary: z.string().min(1),
    evidenceIndexes: z.array(z.number().int().nonnegative()).min(1),
  }).strict()),
}).strict();

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["candidateId", "allocationBps", "evidence", "riskFlags"],
  properties: {
    candidateId: { type: "string" },
    allocationBps: { type: "integer", minimum: 0, maximum: 10_000 },
    evidence: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["url", "title", "claim"],
        properties: { url: { type: "string" }, title: { type: "string" }, claim: { type: "string" } },
      },
    },
    riskFlags: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["candidateId", "severity", "code", "summary", "evidenceIndexes"],
        properties: {
          candidateId: { type: "string" },
          severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
          code: { type: "string" },
          summary: { type: "string" },
          evidenceIndexes: { type: "array", minItems: 1, items: { type: "integer", minimum: 0 } },
        },
      },
    },
  },
} as const;

interface ResearchSolverOptions {
  solverId: string;
  account: LocalAccount;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

function outputText(payload: unknown): string {
  const parsed = z.object({
    status: z.string(),
    output: z.array(z.object({
      type: z.string(),
      content: z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()).optional(),
    }).passthrough()),
  }).passthrough().parse(payload);
  if (parsed.status !== "completed") throw new Error(`Research response ${parsed.status}`);
  const text = parsed.output.flatMap((item) => item.content ?? [])
    .find((item) => item.type === "output_text")?.text;
  if (!text) throw new Error("Research response contained no structured output");
  return text;
}

function candidateById(candidates: MarketCandidate[], id: string): MarketCandidate {
  const candidate = candidates.find((item) => item.id === id);
  if (!candidate) throw new Error("Research solver selected an unknown candidate");
  return candidate;
}

export function createResearchSolver(options: ResearchSolverOptions): Solver {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  return {
    id: options.solverId,
    address: options.account.address,
    async solve({ policy, snapshot, nowSec }: SolverInput): Promise<DecisionBundle> {
      const response = await fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: options.model,
          tools: [{ type: "web_search" }],
          input: [
            { role: "developer", content: "Research protocol and market risk. Choose only a supplied candidate. Never create calldata, approvals, targets, or transaction amounts." },
            { role: "user", content: JSON.stringify({ policy, snapshot }) },
          ],
          text: { format: { type: "json_schema", name: "cobia_research", strict: true, schema: responseSchema } },
        }),
      });
      if (!response.ok) throw new Error(`OpenAI research failed with HTTP ${response.status}`);
      const research = ResearchResultSchema.parse(JSON.parse(outputText(await response.json())));
      const candidate = candidateById(snapshot.candidates, research.candidateId);
      const allocationBps = research.allocationBps;
      const capturedAt = now().toISOString();
      const evidence = research.evidence.map((item) => ({
        ...item,
        retrievedAt: capturedAt,
        contentHash: commitment({ ...item, retrievedAt: capturedAt }),
      }));
      const riskFlags = research.riskFlags.map((flag) => ({
        ...flag,
        evidenceHashes: flag.evidenceIndexes.map((index) => {
          const record = evidence[index];
          if (!record) throw new Error("Research risk flag references missing evidence");
          return record.contentHash;
        }),
        evidenceIndexes: undefined,
      })).map(({ evidenceIndexes: _, ...flag }) => flag);
      const cash = snapshot.candidates.find((item) => item.kind === "cash");
      if (!cash) throw new Error("Snapshot is missing a cash candidate");
      const suppliedAtomic = ((BigInt(policy.principalAtomic) * BigInt(allocationBps)) / 10_000n).toString();
      const expectedNetApyBps = Math.floor(candidate.apyBps * allocationBps / 10_000);
      const action = candidate.kind === "aave-v3" && allocationBps > 0
        ? { kind: "aave-v3-supply" as const, candidateId: candidate.id, investmentId: candidate.investmentId, amountAtomic: suppliedAtomic }
        : { kind: "hold" as const, amountAtomic: policy.principalAtomic };
      return signBundle({
        version: 1,
        requestId: policy.requestId,
        solverId: options.solverId,
        solverAddress: options.account.address,
        policyHash: commitment(policy),
        snapshotHash: commitment(snapshot),
        allocations: candidate.kind === "cash" || allocationBps === 0
          ? [{ candidateId: cash.id, bps: 10_000 }]
          : [{ candidateId: cash.id, bps: 10_000 - allocationBps }, { candidateId: candidate.id, bps: allocationBps }],
        evidence,
        riskFlags,
        expectedNetApyBps,
        action,
        validUntil: Math.min(policy.deadline, nowSec + 300),
      }, options.account);
    },
  };
}
