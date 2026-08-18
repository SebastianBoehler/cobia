import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("../../../../lib/runtime/market", () => ({
  getSolverSubmissionRepository: () => ({ read: mocks.read }),
}));

import { GET } from "./route";

const submissionId = "550e8400-e29b-41d4-a716-446655440020";
const context = (id: string) => ({ params: Promise.resolve({ submissionId: id }) });

describe("public solver program reads", () => {
  it("returns public artifacts without private provenance or credential-bearing RPC data", async () => {
    mocks.read.mockResolvedValue({
      id: submissionId, solverId: "cobia-coding-agent", revision: 1,
      state: "attested", presentationState: "current", programHash: `0x${"11".repeat(32)}`,
      owner: "0x1111111111111111111111111111111111111111", displayGoal: "Supply USDG",
      validUntil: new Date("2033-05-18T03:35:00Z"), blockNumber: "123",
      blockHash: `0x${"22".repeat(32)}`, failureCodes: [], objective: null,
      artifacts: [
        { kind: "program", artifactHash: `0x${"33".repeat(32)}`, payload: { version: 2, actions: [] } },
        { kind: "provenance", artifactHash: `0x${"44".repeat(32)}`, payload: {
          commands: [{ command: "node route.ts", stdout: "secret", cwd: "/tmp/private" }],
          files: [{ path: "/tmp/private/route.ts" }],
          rpcUrl: "https://user:pass@rpc.example/?apiKey=secret",
          privateKey: "0xdeadbeef",
        } },
        { kind: "authorization", artifactHash: `0x${"55".repeat(32)}`, payload: { call: { to: "0x1", data: "0x" } } },
      ],
    });

    const response = await GET(
      new Request(`https://cobia.example/api/programs/${submissionId}`), context(submissionId),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      submission: {
        id: submissionId, executable: true,
        owner: "0x1111111111111111111111111111111111111111",
        displayGoal: "Supply USDG",
      },
      artifacts: {
        program: { payload: { version: 2, actions: [] } },
        provenance: { summary: { commandCount: 1, fileCount: 1 } },
        authorization: { payload: { call: { to: "0x1", data: "0x" } } },
      },
    });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(JSON.stringify(body)).not.toContain("/tmp/private");
    expect(JSON.stringify(body)).not.toContain("rpc.example");
  });

  it("does not return executable authorization for stale evidence", async () => {
    mocks.read.mockResolvedValue({
      id: submissionId, solverId: "cobia-coding-agent", revision: 1,
      state: "attested", presentationState: "expired", programHash: `0x${"11".repeat(32)}`,
      validUntil: new Date("2033-05-18T03:30:00Z"), blockNumber: "123",
      blockHash: `0x${"22".repeat(32)}`, failureCodes: [], objective: null,
      artifacts: [{ kind: "authorization", artifactHash: `0x${"55".repeat(32)}`, payload: { call: {} } }],
    });
    const response = await GET(
      new Request(`https://cobia.example/api/programs/${submissionId}`), context(submissionId),
    );
    const body = await response.json();
    expect(body.submission.executable).toBe(false);
    expect(body.artifacts.authorization).toEqual({ artifactHash: `0x${"55".repeat(32)}` });
  });
});
