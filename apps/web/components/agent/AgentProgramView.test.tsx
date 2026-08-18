// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentProgramView, hasRequiredConfirmations } from "./AgentProgramView";

describe("AgentProgramView", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      submission: {
        id: "550e8400-e29b-41d4-a716-446655440000", state: "expired",
        executable: false, owner: "0x1111111111111111111111111111111111111111",
        blockNumber: "123", displayGoal: "Supply USDG",
      },
      artifacts: {
        program: { payload: { actions: [{ capabilityId: "aave-v3.supply", capabilityVersion: 1 }], balanceConstraints: [] } },
        verdict: { payload: { accepted: true, errorCodes: [] } },
        provenance: { summary: { commandCount: 3, fileCount: 2, networkRequestCount: 1 } },
        replay: { payload: { reproduced: true } },
      },
    }))));
  });

  it("labels expired output as a past discovery with no execution control", async () => {
    render(<AgentProgramView programId="550e8400-e29b-41d4-a716-446655440000" />);
    expect(await screen.findByText("Past discovery")).toBeVisible();
    expect(screen.getByText("aave-v3.supply@1")).toBeVisible();
    expect(screen.getByText(/3 commands · 2 files/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /prepare execution/i })).not.toBeInTheDocument();
  });

  it("does not attribute an execution until its receipt has one confirmation", () => {
    expect(hasRequiredConfirmations("0x7b", "0x7b", 1)).toBe(false);
    expect(hasRequiredConfirmations("0x7b", "0x7c", 1)).toBe(true);
  });
});
