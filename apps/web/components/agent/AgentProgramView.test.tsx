// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const wallet = vi.hoisted(() => ({
  request: vi.fn(), switchChain: vi.fn(), switchToXLayer: vi.fn(),
}));
vi.mock("../wallet/WalletProvider", () => ({
  useWallet: () => ({
    account: "0x1111111111111111111111111111111111111111",
    request: wallet.request,
    switchChain: wallet.switchChain,
    switchToXLayer: wallet.switchToXLayer,
  }),
}));

import { AgentProgramView, hasRequiredConfirmations } from "./AgentProgramView";

describe("AgentProgramView", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(screen.getByText("Fork replay estimate")).toBeVisible();
    expect(screen.getByText("+1.000341 USDt0")).toBeVisible();
    expect(screen.getByText("0.000000 → 1.000341 USDt0")).toBeVisible();
    expect(screen.getByText("Minimum signed outcome: +0.950000 USDt0")).toBeVisible();
    expect(screen.getByText("Verification details").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Approve up to 1.000000 USDG")).not.toBeVisible();
    expect(screen.getByText("Swap 1.000000 USDG for at least 0.995000 USDt0")).not.toBeVisible();
    expect(screen.getByText("cobia-reference")).not.toBeVisible();
    expect(screen.queryByRole("heading", { name: "Research footprint" })).not.toBeInTheDocument();
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
    expect(screen.getByText(/verification stopped: verifier failed/i)).toBeVisible();
    expect(screen.getByRole("link", { name: /create fresh intent/i })).toHaveAttribute("href", "/intents/new");
  });

  it("leads with the confirmed outcome and keeps audit evidence collapsed", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      submission: {
        id: "550e8400-e29b-41d4-a716-446655440000", state: "executed", executable: false,
        owner: "0x1111111111111111111111111111111111111111", solverId: "cobia-reference",
        revision: 2, programHash: `0x${"11".repeat(32)}`, validUntil: "2033-05-18T03:35:00Z",
        blockNumber: "123", blockHash: `0x${"22".repeat(32)}`, displayGoal: "Swap USDG",
        failureCodes: [],
      },
      artifacts: {
        snapshot: { payload: { tokenEvidence: [{
          token: "0x2222222222222222222222222222222222222222", symbol: "USDt0", decimals: 6,
        }] } },
        evidence: { payload: { balanceDeltas: [{
          token: "0x2222222222222222222222222222222222222222",
          beforeAtomic: "525665", afterAtomic: "1525994",
        }] } },
        replay: { payload: { reproduced: true } },
        receipt: { payload: {
          transactionHash: `0x${"33".repeat(32)}`, blockNumber: "456",
          balanceChanges: [{
            token: "0x2222222222222222222222222222222222222222",
            beforeAtomic: "525665", afterAtomic: "1525994",
          }],
        } },
      },
    })));

    render(<AgentProgramView programId="550e8400-e29b-41d4-a716-446655440000" />);

    expect(await screen.findByText("Swap complete")).toBeVisible();
    expect(screen.getByText("+1.000329 USDt0")).toBeVisible();
    expect(screen.getByRole("link", { name: /view transaction/i })).toHaveAttribute(
      "href", `https://web3.okx.com/explorer/xlayer/tx/0x${"33".repeat(32)}`,
    );
    const details = screen.getByText("Verification details").closest("details");
    expect(details).not.toHaveAttribute("open");
  });

  it("does not attribute an execution until its receipt has one confirmation", () => {
    expect(hasRequiredConfirmations("0x7b", "0x7b", 1)).toBe(false);
    expect(hasRequiredConfirmations("0x7b", "0x7c", 1)).toBe(true);
  });

  it("refreshes an expired program after the wallet execution call fails", async () => {
    const current = {
      submission: {
        id: "550e8400-e29b-41d4-a716-446655440000", state: "current", executable: true,
        owner: "0x1111111111111111111111111111111111111111", solverId: "cobia-reference",
        revision: 1, programHash: `0x${"11".repeat(32)}`, validUntil: "2033-05-18T03:35:00Z",
        blockNumber: "123", blockHash: `0x${"22".repeat(32)}`, displayGoal: "Swap USDG",
        failureCodes: [],
      },
      artifacts: {
        snapshot: { payload: { tokenEvidence: [{
          token: "0x3333333333333333333333333333333333333333", symbol: "USDG", decimals: 6,
        }] } },
        program: { payload: { actions: [{
          capabilityId: "uniswap-v3.exact-input", capabilityVersion: 1,
          parameters: {
            tokenIn: "0x3333333333333333333333333333333333333333",
            tokenOut: "0x2222222222222222222222222222222222222222",
          },
        }] } },
        replay: { payload: { reproduced: true } },
      },
    };
    let programReads = 0;
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/execution")) {
        return new Response(JSON.stringify({
          chainId: 196, approvals: [],
          execution: { to: "0x2222222222222222222222222222222222222222", data: "0x1234", value: "0x0" },
        }));
      }
      programReads += 1;
      return new Response(JSON.stringify(programReads === 1 ? current : {
        ...current,
        submission: { ...current.submission, state: "expired", executable: false },
      }));
    });
    wallet.request.mockImplementation(async ({ method }: { method: string }) => {
      if (method === "personal_sign") return `0x${"33".repeat(65)}`;
      if (method === "eth_sendTransaction") throw new Error("Execution reverted.");
      throw new Error(`Unexpected wallet method ${method}`);
    });

    render(<AgentProgramView programId="550e8400-e29b-41d4-a716-446655440000" />);
    fireEvent.click(await screen.findByRole("button", { name: "Prepare execution" }));
    fireEvent.click(await screen.findByRole("button", { name: "Swap now" }));

    expect(await screen.findByText("Verified history")).toBeVisible();
    expect(screen.getByRole("link", { name: /create fresh intent/i })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Swap now" })).not.toBeInTheDocument();
  });

  it("reuses the fresh access signature when attributing the confirmed receipt", async () => {
    const transactionHash = `0x${"44".repeat(32)}`;
    const current = {
      submission: {
        id: "550e8400-e29b-41d4-a716-446655440000", state: "current", executable: true,
        owner: "0x1111111111111111111111111111111111111111", solverId: "cobia-reference",
        revision: 2, programHash: `0x${"11".repeat(32)}`, validUntil: "2033-05-18T03:35:00Z",
        blockNumber: "123", blockHash: `0x${"22".repeat(32)}`, displayGoal: "Swap USDG",
        failureCodes: [],
      },
      artifacts: {
        snapshot: { payload: { tokenEvidence: [{
          token: "0x3333333333333333333333333333333333333333", symbol: "USDG", decimals: 6,
        }] } },
        program: { payload: { actions: [{
          capabilityId: "uniswap-v3.exact-input", capabilityVersion: 1,
          parameters: {
            tokenIn: "0x3333333333333333333333333333333333333333",
            tokenOut: "0x2222222222222222222222222222222222222222",
          },
        }] } },
        execution: { payload: { program: { actions: [{ approvals: [{
          token: "0x3333333333333333333333333333333333333333", amount: "1000000",
        }] }] } } },
        replay: { payload: { reproduced: true } },
      },
    };
    let receiptRecorded = false;
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (!url.includes("/execution")) {
        return new Response(JSON.stringify(receiptRecorded ? {
          ...current,
          submission: { ...current.submission, state: "executed", executable: false },
          artifacts: { ...current.artifacts, receipt: { payload: {
            version: 3, transactionHash, blockNumber: "124",
          } } },
        } : current));
      }
      if (url.endsWith("/execution/receipt")) {
        receiptRecorded = true;
        return new Response(JSON.stringify({ state: "confirmed", receipt: {
          version: 3, transactionHash, blockNumber: "124",
        } }));
      }
      return new Response(JSON.stringify({
        chainId: 196, approvals: [{
          to: "0x3333333333333333333333333333333333333333", data: "0x1234", value: "0x0",
        }],
        execution: { to: "0x2222222222222222222222222222222222222222", data: "0x1234", value: "0x0" },
      }));
    });
    wallet.request.mockImplementation(async ({ method }: { method: string }) => {
      if (method === "personal_sign") return `0x${"33".repeat(65)}`;
      if (method === "eth_sendTransaction") return transactionHash;
      if (method === "eth_getTransactionReceipt") return { status: "0x1", blockNumber: "0x7b" };
      if (method === "eth_blockNumber") return "0x7c";
      throw new Error(`Unexpected wallet method ${method}`);
    });

    render(<AgentProgramView programId="550e8400-e29b-41d4-a716-446655440000" />);
    fireEvent.click(await screen.findByRole("button", { name: "Prepare execution" }));
    fireEvent.click(await screen.findByRole("button", { name: "Allow 1 USDG" }));
    fireEvent.click(await screen.findByRole("button", { name: "Swap now" }));

    expect(await screen.findByText("Swap complete")).toBeVisible();
    await waitFor(() => expect(wallet.request.mock.calls.filter(
      ([request]) => request.method === "personal_sign",
    )).toHaveLength(1));
  });
});
