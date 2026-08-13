// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentProgramView } from "./AgentProgramView";

describe("AgentProgramView", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      id: "550e8400-e29b-41d4-a716-446655440000",
      state: "attested",
      validity: "past-discovery",
      executable: false,
      owner: "0x1111111111111111111111111111111111111111",
      blockNumber: "123",
      program: { actions: [{ capabilityId: "aave-v3.supply", capabilityVersion: 1 }], constraints: [] },
      verdict: { accepted: true, errorCodes: [] },
      provenance: { modelResponseIds: ["resp_1"], commands: [] },
      replay: { reproduced: true },
      receipt: null,
    }))));
  });

  it("labels expired output as a past discovery with no execution control", async () => {
    render(<AgentProgramView programId="550e8400-e29b-41d4-a716-446655440000" />);
    expect(await screen.findByText("Past discovery")).toBeVisible();
    expect(screen.getByText("aave-v3.supply@1")).toBeVisible();
    expect(screen.queryByRole("button", { name: /prepare execution/i })).not.toBeInTheDocument();
  });
});
