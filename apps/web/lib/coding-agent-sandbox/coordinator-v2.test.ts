import { describe, expect, it, vi } from "vitest";
import { coordinateCapabilityProgramV2 } from "./coordinator-v2";

const program = { version: 2, kind: "general-onchain" } as never;
const evidence = { version: 2, kind: "general-onchain" } as never;
const provenance = { commands: [] } as never;

function setup(accepted = true) {
  const events: string[] = [];
  const programs = {
    create: vi.fn(async () => ({ id: "550e8400-e29b-41d4-a716-446655440000" })),
    start: vi.fn(async () => events.push("start")),
    append: vi.fn(async (_id: string, kind: string) => events.push(kind)),
    markVerified: vi.fn(async () => events.push("verified")),
    markAttested: vi.fn(async () => events.push("attested")),
    reject: vi.fn(async () => events.push("rejected")),
    fail: vi.fn(async () => events.push("failed")),
  };
  return {
    events,
    dependencies: {
      programs,
      runSandbox: vi.fn(async () => ({ program, evidence, provenance })),
      verify: vi.fn(async () => ({
        accepted,
        errorCodes: accepted ? [] : ["PREDICATE_FALSE"],
        compiled: accepted ? ([{}] as never) : [],
        replay: accepted ? { reproduced: true } : undefined,
      })),
      project: vi.fn(() => ({ owner: "0x1111111111111111111111111111111111111111" })),
      attest: vi.fn(async () => ({ version: 3, call: { to: "0x2222222222222222222222222222222222222222" } })),
    },
  };
}

const input = {
  job: {
    requestId: "550e8400-e29b-41d4-a716-446655440000",
    owner: "0x1111111111111111111111111111111111111111",
    policyHash: `0x${"11".repeat(32)}`,
    snapshotHash: `0x${"22".repeat(32)}`,
    manifestHash: `0x${"33".repeat(32)}`,
    blockNumber: "123",
    blockHash: `0x${"44".repeat(32)}`,
  },
  policy: {}, snapshot: {}, portfolio: { balances: [], allowances: [], positions: [] },
  manifest: {}, executor: "0x2222222222222222222222222222222222222222",
} as const;

describe("general capability coordinator", () => {
  it("persists immutable evidence before wrapping and attesting V3 execution", async () => {
    const { events, dependencies } = setup();
    const result = await coordinateCapabilityProgramV2(input, dependencies);
    expect(result.jobId).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(events).toEqual([
      "start", "program", "evidence", "provenance", "verdict", "replay",
      "execution", "verified", "authorization", "attested",
    ]);
    expect(dependencies.programs.append).toHaveBeenCalledWith(
      expect.any(String), "execution", expect.objectContaining({ version: 3 }),
    );
  });

  it("stores a stable verifier rejection and emits no executable artifact", async () => {
    const { events, dependencies } = setup(false);
    await expect(coordinateCapabilityProgramV2(input, dependencies)).rejects.toThrow("PREDICATE_FALSE");
    expect(events).toEqual(["start", "program", "evidence", "provenance", "verdict", "rejected"]);
    expect(dependencies.attest).not.toHaveBeenCalled();
  });
});
