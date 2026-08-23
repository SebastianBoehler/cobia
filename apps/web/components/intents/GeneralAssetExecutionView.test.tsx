// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProgramView } from "../agent/agent-program-types";

const wallet = vi.hoisted(() => ({ request: vi.fn(), switchChain: vi.fn() }));
vi.mock("../wallet/WalletProvider", () => ({
  useWallet: () => ({ account: "0x1111111111111111111111111111111111111111",
    request: wallet.request, switchChain: wallet.switchChain }),
}));

import { GeneralAssetExecutionView } from "./GeneralAssetExecutionView";

const owner = "0x1111111111111111111111111111111111111111" as const;
const token = "0x2222222222222222222222222222222222222222" as const;
const target = "0x3333333333333333333333333333333333333333" as const;
const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const transactionHash = hash("9");
const transaction = { chainId: 196 as const, from: owner, to: target, nonce: "7",
  value: "0x0" as const, data: "0x12345678" as const };

const program = {
  submission: { id: "550e8400-e29b-41d4-a716-446655440000", solverId: "cobia-reference",
    revision: 1, programHash: hash("a"), state: "current", executable: true, owner,
    validUntil: "2033-05-18T03:35:00Z", blockNumber: "123", blockHash: hash("b"),
    displayGoal: "Move an exact random token", failureCodes: [] },
  artifacts: { execution: { payload: { version: 4, kind: "general-asset-execution" } } },
} as ProgramView;

function review() {
  return { programVersion: 4, programId: hash("1"), owner, deadline: 2_000_000_300,
    state: "prepared", finalOutput: { chainId: 1, token, minimumAtomic: "90" },
    stages: [{ stageId: hash("2"), ordinal: 0, chainId: 196, predecessorStageId: null,
      state: "prepared", inputToken: token, transaction, requiredConfirmations: 12,
      delivery: { kind: "bridge", destinationChainId: 1, recipient: owner, token,
        minimumAtomic: "90" }, evidenceHash: hash("3") },
    { stageId: hash("4"), ordinal: 1, chainId: 1, predecessorStageId: hash("2"),
      state: "pending", inputToken: token, transaction: { ...transaction, chainId: 1, nonce: "8" },
      requiredConfirmations: 15, delivery: { kind: "none" }, evidenceHash: hash("5") }] };
}

describe("GeneralAssetExecutionView", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    wallet.request.mockImplementation(async ({ method }: { method: string }) => {
      if (method === "personal_sign") return `0x${"11".repeat(65)}`;
      if (method === "eth_sendTransaction") return transactionHash;
      throw new Error(`Unexpected wallet method ${method}`);
    });
  });

  it("reviews ordered stages, switches chain and submits one exact stage confirmation", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/execution")) return new Response(JSON.stringify(review()));
      const action = JSON.parse(String(init?.body)).action;
      if (action === "arm") return new Response(JSON.stringify({ state: "broadcasting",
        stageId: hash("2"), transaction }));
      if (action === "submitted") return new Response(JSON.stringify({ state: "submitted", stageId: hash("2") }));
      return new Response(JSON.stringify({ state: "finalized", stageId: hash("2"),
        delivery: review().stages[0]!.delivery }));
    }));

    render(<GeneralAssetExecutionView program={program} />);
    fireEvent.click(screen.getByRole("button", { name: "Review execution stages" }));

    expect(await screen.findByText("Stage 1 · X Layer")).toBeVisible();
    expect(screen.getByText("Stage 2 · Ethereum")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Confirm stage 1 on X Layer" }));

    await waitFor(() => expect(wallet.switchChain).toHaveBeenCalledWith(196));
    expect(wallet.request).toHaveBeenCalledWith({ method: "eth_sendTransaction", params: [{
      from: owner, to: target, data: "0x12345678", value: "0x0", nonce: "0x7",
    }] });
    expect(await screen.findByText("Waiting for independently verified bridge delivery.")).toBeVisible();
  });

  it("refuses an armed transaction that differs from the reviewed attestation", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input) => String(input).endsWith("/execution")
      ? new Response(JSON.stringify(review()))
      : new Response(JSON.stringify({ state: "broadcasting", stageId: hash("2"),
        transaction: { ...transaction, data: "0x87654321" } }))));

    render(<GeneralAssetExecutionView program={program} />);
    fireEvent.click(screen.getByRole("button", { name: "Review execution stages" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm stage 1 on X Layer" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("does not match attestation");
    expect(wallet.request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "eth_sendTransaction" }));
  });
});
