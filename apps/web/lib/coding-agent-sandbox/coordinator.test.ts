import type {
  CapabilityProgramEvidenceV1,
  CapabilityProgramV1,
  CapabilitySandboxProvenanceV1,
  CompiledCapabilityActionV1,
} from "@cobia/solvers";
import { describe, expect, it, vi } from "vitest";
import { coordinateCapabilityProgramV1 } from "./coordinator";

const program = { policyHash: "policy", owner: "owner" } as unknown as CapabilityProgramV1;
const evidence = { traceHash: "trace" } as unknown as CapabilityProgramEvidenceV1;
const provenance = { commands: [] } as unknown as CapabilitySandboxProvenanceV1;
const compiled = [{ capabilityId: "research.action" }] as unknown as CompiledCapabilityActionV1[];
const execution = { canonicalProgramHash: "program" };
const authorization = { signature: "attestation" };

function repository() {
  return {
    create: vi.fn(async () => ({ id: "job-1", state: "queued" })),
    start: vi.fn(async () => ({ id: "job-1", state: "running" })),
    append: vi.fn(async () => ({})),
    markVerified: vi.fn(async () => ({ id: "job-1", state: "verified" })),
    markAttested: vi.fn(async () => ({ id: "job-1", state: "attested" })),
    reject: vi.fn(async () => ({ id: "job-1", state: "rejected" })),
    fail: vi.fn(async () => ({ id: "job-1", state: "failed" })),
  };
}

function dependencies(accepted = true) {
  const programs = repository();
  return {
    programs,
    runSandbox: vi.fn(async () => ({ program, evidence, provenance })),
    verify: vi.fn(async () => ({
      accepted,
      errorCodes: accepted ? [] : ["REPLAY_MISMATCH"],
      compiled: accepted ? compiled : [],
      replay: accepted ? { reproduced: true, traceHash: "trace" } : undefined,
    })),
    project: vi.fn(() => execution),
    attest: vi.fn(async () => authorization),
  };
}

const input = {
  job: {
    requestId: "550e8400-e29b-41d4-a716-446655440000",
    owner: "0x1111111111111111111111111111111111111111" as const,
    policyHash: `0x${"11".repeat(32)}`,
    snapshotHash: `0x${"22".repeat(32)}`,
    manifestHash: `0x${"33".repeat(32)}`,
    blockNumber: "123",
    blockHash: `0x${"44".repeat(32)}`,
  },
  policy: { signed: true },
  snapshot: { public: true },
  portfolio: { balances: [], allowances: [], positions: [] },
  manifest: { trusted: true },
  executor: "0x2222222222222222222222222222222222222222" as const,
};

describe("coding-agent capability coordinator", () => {
  it("attests only after sandbox generation, independent verification, and replay", async () => {
    const deps = dependencies();
    const result = await coordinateCapabilityProgramV1(input, deps);

    expect(result).toEqual({ jobId: "job-1", program, evidence, execution, authorization });
    expect(deps.programs.append.mock.calls.map((call) => call[1])).toEqual([
      "program", "evidence", "provenance", "verdict", "replay", "execution", "authorization",
    ]);
    expect(deps.runSandbox).toHaveBeenCalledWith(input, "job-1");
    expect(deps.programs.markVerified).toHaveBeenCalledBefore(deps.attest);
    expect(deps.attest).toHaveBeenCalledWith({ execution, program, evidence });
    expect(deps.programs.markAttested).toHaveBeenCalledAfter(deps.attest);
  });

  it("persists explicit rejection codes and never projects or attests", async () => {
    const deps = dependencies(false);
    await expect(coordinateCapabilityProgramV1(input, deps)).rejects.toThrow("REPLAY_MISMATCH");
    expect(deps.programs.reject).toHaveBeenCalledWith("job-1", "REPLAY_MISMATCH");
    expect(deps.project).not.toHaveBeenCalled();
    expect(deps.attest).not.toHaveBeenCalled();
    expect(deps.programs.markVerified).not.toHaveBeenCalled();
  });

  it("records coordinator failures without hiding the original error", async () => {
    const deps = dependencies();
    deps.runSandbox.mockRejectedValueOnce(new Error("sandbox timed out"));
    await expect(coordinateCapabilityProgramV1(input, deps)).rejects.toThrow("sandbox timed out");
    expect(deps.programs.fail).toHaveBeenCalledWith("job-1", "SANDBOX_FAILED");
    expect(deps.verify).not.toHaveBeenCalled();
  });

  it("records an attestation failure after the program was verified", async () => {
    const deps = dependencies();
    deps.attest.mockRejectedValueOnce(new Error("attestation unavailable"));

    await expect(coordinateCapabilityProgramV1(input, deps)).rejects.toThrow(
      "attestation unavailable",
    );
    expect(deps.programs.markVerified).toHaveBeenCalledOnce();
    expect(deps.programs.fail).toHaveBeenCalledWith("job-1", "ATTESTATION_FAILED");
    expect(deps.programs.markAttested).not.toHaveBeenCalled();
  });

  it("reports both the primary and persistence failures", async () => {
    const deps = dependencies();
    deps.runSandbox.mockRejectedValueOnce(new Error("sandbox timed out"));
    deps.programs.fail.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(coordinateCapabilityProgramV1(input, deps)).rejects.toSatisfy((error) => {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual([
        new Error("sandbox timed out"),
        new Error("database unavailable"),
      ]);
      return true;
    });
  });
});
