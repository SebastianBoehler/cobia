import { describe, expect, it, vi } from "vitest";
import { encodeFunctionData, erc20Abi } from "viem";
import { prepareAgentExecutionV1 } from "./agent-execution";

const owner = "0x1111111111111111111111111111111111111111" as const;
const executor = "0x2222222222222222222222222222222222222222" as const;
const token = "0x3333333333333333333333333333333333333333" as const;

describe("agent execution preparation", () => {
  it("returns an exact bounded approval and persisted attested call only to the owner", () => {
    const context = {
      state: "attested", owner, blockNumber: "123", blockHash: `0x${"44".repeat(32)}`,
      policy: { owner, deadline: 2_000, maxSnapshotAgeSec: 300 },
      snapshot: { capturedAt: new Date(1_000_000).toISOString() },
      artifacts: [{ kind: "execution", artifactHash: "hash", payload: {
        owner, inputToken: token, inputAmount: "10", deadline: "2000",
      } }, { kind: "authorization", artifactHash: "hash", payload: {
        call: { to: executor, data: "0x12345678", value: "0" },
      } }],
    };
    const result = prepareAgentExecutionV1({
      context, owner, executor, nowSec: 1_100,
      verifyArtifact: vi.fn(() => true),
    });
    expect(result.approval).toEqual({
      to: token,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [executor, 10n] }),
      value: "0x0",
    });
    expect(result.execution).toEqual({ to: executor, data: "0x12345678", value: "0x0" });
  });

  it.each([
    ["wrong owner", { owner: "0x9999999999999999999999999999999999999999" }],
    ["stale", { nowSec: 1_301 }],
    ["unattested", { state: "verified" }],
  ])("rejects %s", (_label, changed) => {
    const context = {
      state: "attested", owner, policy: { owner, deadline: 2_000, maxSnapshotAgeSec: 300 },
      snapshot: { capturedAt: new Date(1_000_000).toISOString() },
      artifacts: [],
    };
    expect(() => prepareAgentExecutionV1({
      context: { ...context, ...changed }, owner, executor,
      nowSec: "nowSec" in changed ? changed.nowSec : 1_100,
      verifyArtifact: () => true,
    })).toThrow();
  });
});
