import { commitment } from "@cobia/domain";
import { describe, expect, it, vi } from "vitest";
import { coordinateCompetitionProgram } from "./competition-coordinator";

const program = { version: 2, kind: "general-onchain", actions: [] } as never;
const evidence = { version: 2, blockNumber: "123" } as never;
const provenance = { commands: [] } as never;
const jobId = "550e8400-e29b-41d4-a716-446655440010";
const submissionId = "550e8400-e29b-41d4-a716-446655440020";

function setup(generated: typeof program | null = program) {
  const events: string[] = [];
  const runs = {
    create: vi.fn(async () => ({ id: jobId })),
    start: vi.fn(async () => events.push("run:start")),
    complete: vi.fn(async () => events.push("run:completed")),
    abstain: vi.fn(async () => events.push("run:abstained")),
    fail: vi.fn(async () => events.push("run:failed")),
  };
  const submissions = {
    append: vi.fn(async () => ({ id: submissionId })),
    appendArtifact: vi.fn(async (_id: string, kind: string) => events.push(kind)),
    resolve: vi.fn(async (_id: string, state: string) => events.push(state)),
  };
  return {
    events,
    dependencies: {
      runs, submissions,
      runSandbox: vi.fn(async () => generated ? { program: generated, evidence, provenance } : null),
      verify: vi.fn(async () => ({
        accepted: true, errorCodes: [], compiled: [{}], replay: { reproduced: true },
      })),
      project: vi.fn(() => ({ version: 3, owner: "0x1111111111111111111111111111111111111111" })),
      attest: vi.fn(async () => ({ version: 3, call: { data: "0x" } })),
    },
  };
}

const input = {
  solverId: "cobia-coding-agent", revision: 1,
  observedAtSec: 2_000_000_000, validUntilSec: 2_000_000_180,
  job: {
    requestId: "550e8400-e29b-41d4-a716-446655440000",
    owner: "0x1111111111111111111111111111111111111111",
    policyHash: `0x${"11".repeat(32)}`,
    snapshotHash: `0x${"22".repeat(32)}`,
    manifestHash: `0x${"33".repeat(32)}`,
    blockNumber: "123", blockHash: `0x${"44".repeat(32)}`,
  },
  policy: {}, snapshot: {}, portfolio: { balances: [], allowances: [], positions: [] },
  manifest: {}, executor: "0x2222222222222222222222222222222222222222",
} as const;

describe("competition coding-agent coordinator", () => {
  it("publishes one immutable revision only after the agent authors a program", async () => {
    const { events, dependencies } = setup();
    const result = await coordinateCompetitionProgram(input, dependencies as never);

    expect(result).toMatchObject({ status: "attested", runId: jobId, submissionId });
    expect(dependencies.submissions.append).toHaveBeenCalledWith(expect.objectContaining({
      intentId: input.job.requestId, solverId: "cobia-coding-agent", revision: 1,
      programHash: commitment(program),
    }));
    expect(events).toEqual([
      "run:start", "snapshot", "program", "evidence", "provenance", "verdict", "replay",
      "execution", "verified", "authorization", "attested", "run:completed",
    ]);
    expect(dependencies.submissions.appendArtifact).toHaveBeenCalledWith(
      submissionId, "snapshot", input.snapshot,
    );
  });

  it("records abstention without fabricating a submission", async () => {
    const { events, dependencies } = setup(null);
    const result = await coordinateCompetitionProgram(input, dependencies as never);

    expect(result).toEqual({ status: "abstained", runId: jobId });
    expect(dependencies.submissions.append).not.toHaveBeenCalled();
    expect(events).toEqual(["run:start", "run:abstained"]);
  });
});
