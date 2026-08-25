import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), readContract: vi.fn() }));
vi.mock("viem", async (importOriginal) => ({
  ...await importOriginal<typeof import("viem")>(),
  createPublicClient: () => ({ readContract: mocks.readContract }),
  http: vi.fn(),
}));
vi.mock("../../../../lib/env", () => ({
  readCodingAgentV3ExecutionConfig: () => ({ XLAYER_RPC_URL: "https://rpc.example" }),
}));
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

  it("enriches an existing V3 receipt with its confirmed token balance change", async () => {
    mocks.readContract.mockResolvedValue(1_525_994n);
    mocks.read.mockResolvedValue({
      id: submissionId, solverId: "cobia-coding-agent", revision: 1,
      state: "executed", presentationState: "executed", programHash: `0x${"11".repeat(32)}`,
      owner: "0x1111111111111111111111111111111111111111", displayGoal: "Swap USDG",
      validUntil: new Date("2033-05-18T03:35:00Z"), blockNumber: "123",
      blockHash: `0x${"22".repeat(32)}`, failureCodes: [], objective: null,
      artifacts: [{
        kind: "evidence", artifactHash: `0x${"33".repeat(32)}`, payload: { balanceDeltas: [{
          token: "0x2222222222222222222222222222222222222222",
          account: "0x1111111111111111111111111111111111111111",
          beforeAtomic: "525665", afterAtomic: "1525994",
        }] },
      }, {
        kind: "receipt", artifactHash: `0x${"44".repeat(32)}`, payload: {
          version: 3, owner: "0x1111111111111111111111111111111111111111",
          transactionHash: `0x${"55".repeat(32)}`, blockNumber: "456",
        },
      }],
    });

    const response = await GET(
      new Request(`https://cobia.example/api/programs/${submissionId}`), context(submissionId),
    );
    const body = await response.json();
    expect(body.artifacts.receipt.payload.balanceChanges).toEqual([{
      token: "0x2222222222222222222222222222222222222222",
      beforeAtomic: "525665", afterAtomic: "1525994",
    }]);
    expect(mocks.readContract).toHaveBeenCalledWith(expect.objectContaining({ blockNumber: 456n }));
  });

  it("enriches a wallet-call batch receipt from canonical replay evidence", async () => {
    mocks.readContract.mockResolvedValue(1_171_680n);
    mocks.read.mockResolvedValue({
      id: submissionId, solverId: "cobia-agentic", revision: 1,
      state: "executed", presentationState: "executed", programHash: `0x${"11".repeat(32)}`,
      owner: "0x1111111111111111111111111111111111111111", displayGoal: "Swap OKB",
      validUntil: new Date("2033-05-18T03:35:00Z"), blockNumber: "123",
      blockHash: `0x${"22".repeat(32)}`, failureCodes: [], objective: null,
      artifacts: [{
        kind: "evidence", artifactHash: `0x${"33".repeat(32)}`, payload: { simulations: [{
          assetDeltas: [{ token: "0x2222222222222222222222222222222222222222",
            account: "0x1111111111111111111111111111111111111111",
            beforeAtomic: "0", afterAtomic: "1171695" }],
        }] },
      }, {
        kind: "receipt", artifactHash: `0x${"44".repeat(32)}`, payload: {
          version: 1, kind: "wallet-call-batch-receipt",
          owner: "0x1111111111111111111111111111111111111111",
          transactionHash: `0x${"55".repeat(32)}`,
          receipts: [{ blockNumber: "68851188" }],
        },
      }],
    });

    const response = await GET(
      new Request(`https://cobia.example/api/programs/${submissionId}`), context(submissionId),
    );
    const body = await response.json();
    expect(body.artifacts.receipt.payload).toMatchObject({ blockNumber: "68851188",
      balanceChanges: [{ token: "0x2222222222222222222222222222222222222222",
        beforeAtomic: "0", afterAtomic: "1171680" }] });
  });
});
