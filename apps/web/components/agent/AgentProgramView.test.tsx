// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentProgramView, hasRequiredConfirmations } from "./AgentProgramView";

describe("AgentProgramView", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      submission: {
        id: "550e8400-e29b-41d4-a716-446655440000", state: "expired",
        executable: false, owner: "0x1111111111111111111111111111111111111111",
        solverId: "cobia-reference", revision: 2, programHash: `0x${"11".repeat(32)}`,
        validUntil: "2033-05-18T03:35:00Z", blockNumber: "123",
        blockHash: `0x${"22".repeat(32)}`, displayGoal: "Supply USDG", failureCodes: [],
      },
      artifacts: {
        snapshot: { payload: { tokenEvidence: [{
          token: "0x2222222222222222222222222222222222222222", symbol: "USDt0", decimals: 6,
        }, { token: "0x3333333333333333333333333333333333333333", symbol: "USDG", decimals: 6 }] } },
        program: { payload: {
          input: { token: "0x3333333333333333333333333333333333333333", atomic: "1000000" },
          actions: [{ capabilityId: "uniswap-v3.exact-input", capabilityVersion: 1, parameters: {
            tokenIn: "0x3333333333333333333333333333333333333333",
            tokenOut: "0x2222222222222222222222222222222222222222",
            amountInAtomic: "1000000", minimumOutputAtomic: "995000",
          } }],
          balanceConstraints: [{ kind: "minimumIncrease", token: "0x2222222222222222222222222222222222222222", atomic: "950000" }],
        } },
        evidence: { payload: { balanceDeltas: [{
          token: "0x2222222222222222222222222222222222222222",
          beforeAtomic: "0", afterAtomic: "1000341",
        }] } },
        execution: { payload: { program: { actions: [{ approvals: [{
          token: "0x3333333333333333333333333333333333333333", amount: "1000000",
        }] }] } } },
        verdict: { payload: { accepted: true, errorCodes: [] } },
        provenance: { summary: { commandCount: 3, fileCount: 2, networkRequestCount: 1 } },
        replay: { payload: { reproduced: true } },
      },
    }))));
  });

  it("labels expired replayed output as verified history with no execution control", async () => {
    render(<AgentProgramView programId="550e8400-e29b-41d4-a716-446655440000" />);
    expect(await screen.findByText("Verified history")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Supply USDG" })).toBeVisible();
    expect(screen.queryByText(/program audit/i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Simulated balance change" })).toBeVisible();
    expect(screen.getByText("+1.000341 USDt0")).toBeVisible();
    expect(screen.getByText("0.000000 → 1.000341 USDt0")).toBeVisible();
    expect(screen.getByText("Minimum signed outcome: +0.950000 USDt0")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Transaction steps" })).toBeVisible();
    expect(screen.getByText("Approve up to 1.000000 USDG")).toBeVisible();
    expect(screen.getByText("Swap 1.000000 USDG for at least 0.995000 USDt0")).toBeVisible();
    expect(screen.getByText("cobia-reference")).toBeVisible();
    expect(screen.queryByRole("button", { name: /prepare execution/i })).not.toBeInTheDocument();
  });

  it("makes a verifier infrastructure failure explicit", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      submission: {
        id: "550e8400-e29b-41d4-a716-446655440000", state: "failed", executable: false,
        owner: "0x1111111111111111111111111111111111111111", solverId: "cobia-reference",
        revision: 2, programHash: `0x${"11".repeat(32)}`, validUntil: "2033-05-18T03:35:00Z",
        blockNumber: "123", blockHash: `0x${"22".repeat(32)}`, displayGoal: "Swap USDG",
        failureCodes: ["VERIFIER_FAILED"],
      }, artifacts: { program: { payload: { actions: [] } } },
    })));
    render(<AgentProgramView programId="550e8400-e29b-41d4-a716-446655440000" />);
    expect(await screen.findByText("Verification failed")).toBeVisible();
    expect(screen.getByText("verifier failed")).toBeVisible();
    expect(screen.getByRole("link", { name: /create fresh intent/i })).toHaveAttribute("href", "/intents/new");
  });

  it("does not attribute an execution until its receipt has one confirmation", () => {
    expect(hasRequiredConfirmations("0x7b", "0x7b", 1)).toBe(false);
    expect(hasRequiredConfirmations("0x7b", "0x7c", 1)).toBe(true);
  });
});
