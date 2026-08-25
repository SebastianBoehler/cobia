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
    window.history.replaceState({}, "", "/");
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

  it("recovers a confirmed batch from receipt hashes in the program URL", async () => {
    const hashes = [`0x${"44".repeat(32)}`, `0x${"55".repeat(32)}`];
    window.history.replaceState({}, "", `/?receiptHashes=${hashes.join(",")}`);
    wallet.request.mockImplementation(async ({ method }: { method: string }) => {
      if (method === "personal_sign") return `0x${"33".repeat(65)}`;
      throw new Error(`Unexpected wallet request: ${method}`);
    });
    render(<AgentProgramView programId="550e8400-e29b-41d4-a716-446655440000" />);
    const retry = await screen.findByRole("button", { name: "Retry receipt verification" });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ state: "confirmed", receipt: {
      transactionHash: hashes[1], blockNumber: "456",
    } })));

    fireEvent.click(retry);

    await waitFor(() => expect(vi.mocked(fetch).mock.calls).toContainEqual([
      "/api/programs/550e8400-e29b-41d4-a716-446655440000/execution/receipt",
      expect.objectContaining({ body: expect.stringContaining(hashes[0]!) }),
    ]));
    expect(wallet.request).toHaveBeenCalledWith(expect.objectContaining({ method: "personal_sign" }));
  });

  it("shows signed net changes instead of counting an intermediate asset twice", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      submission: {
        id: "550e8400-e29b-41d4-a716-446655440000", state: "current", executable: true,
        owner: "0x1111111111111111111111111111111111111111", solverId: "cobia-reference",
        revision: 2, programHash: `0x${"11".repeat(32)}`, validUntil: "2033-05-18T03:35:00Z",
        blockNumber: "123", blockHash: `0x${"22".repeat(32)}`,
        displayGoal: "Sell all aXlrUSDT0 into USDG", failureCodes: [],
      },
      artifacts: {
        snapshot: { payload: { tokenEvidence: [{
          token: "0x2222222222222222222222222222222222222222", symbol: "aXlrUSDT0", decimals: 6,
        }, {
          token: "0x3333333333333333333333333333333333333333", symbol: "USDt0", decimals: 6,
        }, {
          token: "0x4444444444444444444444444444444444444444", symbol: "USDG", decimals: 6,
        }] } },
        evidence: { payload: { simulations: [{ assetDeltas: [{
          token: "0x2222222222222222222222222222222222222222",
          account: "0x1111111111111111111111111111111111111111",
          beforeAtomic: "1000465", afterAtomic: "9983",
        }, {
          token: "0x3333333333333333333333333333333333333333",
          account: "0x1111111111111111111111111111111111111111",
          beforeAtomic: "9983", afterAtomic: "1000465",
        }] }, { assetDeltas: [{
          token: "0x3333333333333333333333333333333333333333",
          account: "0x1111111111111111111111111111111111111111",
          beforeAtomic: "1000465", afterAtomic: "9983",
        }, {
          token: "0x4444444444444444444444444444444444444444",
          account: "0x1111111111111111111111111111111111111111",
          beforeAtomic: "324768", afterAtomic: "1314646",
        }] }] } },
        replay: { payload: { reproduced: true } },
      },
    })));

    render(<AgentProgramView programId="550e8400-e29b-41d4-a716-446655440000" />);

    expect(await screen.findByText("-0.990482 aXlrUSDT0")).toBeVisible();
    expect(screen.getByText("+0.989878 USDG")).toBeVisible();
    expect(screen.queryByText(/USDt0$/)).not.toBeInTheDocument();
  });

  it("marks a long signed goal for a compact program heading", async () => {
    const longGoal = "Use 1 USDG to enter the best verified stablecoin-yield route ending in USDt0 on X Layer. Only use Aave V3, Curve or Uniswap. Allow no more than 1% conversion loss, require a minimum receipt-token balance, and expire in ten minutes.";
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      submission: {
        id: "550e8400-e29b-41d4-a716-446655440000", state: "expired", executable: false,
        owner: "0x1111111111111111111111111111111111111111", solverId: "cobia-reference",
        revision: 2, programHash: `0x${"11".repeat(32)}`, validUntil: "2033-05-18T03:35:00Z",
        blockNumber: "123", blockHash: `0x${"22".repeat(32)}`, displayGoal: longGoal,
        failureCodes: [],
      },
      artifacts: {},
    })));

    render(<AgentProgramView programId="550e8400-e29b-41d4-a716-446655440000" />);

    expect(await screen.findByRole("heading", { name: longGoal })).toHaveAttribute(
      "data-title-density", "long",
    );
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
    expect(await screen.findByText("No solver fee during launch")).toBeVisible();
    expect(screen.queryByText(/fee authorization/i)).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Prepare execution" }));

    expect(await screen.findByText("Verified history")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Execution reverted.");
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
    let executionReads = 0;
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
      executionReads += 1;
      return new Response(JSON.stringify({
        chainId: 196, approvals: executionReads === 1 ? [{
          to: "0x3333333333333333333333333333333333333333", data: "0x1234", value: "0x0",
        }] : [],
        execution: { to: "0x2222222222222222222222222222222222222222", data: "0x1234", value: "0x0" },
      }));
    });
    let lastTransaction: Record<string, string> | undefined;
    wallet.request.mockImplementation(async ({ method, params }: { method: string; params?: unknown[] }) => {
      if (method === "personal_sign") return `0x${"33".repeat(65)}`;
      if (method === "eth_sendTransaction") {
        lastTransaction = (params?.[0] ?? {}) as Record<string, string>;
        return transactionHash;
      }
      if (method === "eth_getTransactionReceipt") return { status: "0x1", blockNumber: "0x7b" };
      if (method === "eth_getTransactionByHash") return {
        from: lastTransaction?.from, to: lastTransaction?.to,
        input: lastTransaction?.data, value: lastTransaction?.value,
      };
      if (method === "eth_blockNumber") return "0x7c";
      throw new Error(`Unexpected wallet method ${method}`);
    });

    render(<AgentProgramView programId="550e8400-e29b-41d4-a716-446655440000" />);
    fireEvent.click(await screen.findByRole("button", { name: "Prepare execution" }));

    expect(await screen.findByText("Swap complete")).toBeVisible();
    await waitFor(() => expect(wallet.request.mock.calls.filter(
      ([request]) => request.method === "personal_sign",
    )).toHaveLength(1));
    expect(wallet.request.mock.calls.filter(
      ([request]) => request.method === "eth_sendTransaction",
    )).toHaveLength(2);
  });

  it("retries receipt attribution without broadcasting the confirmed transaction again", async () => {
    const transactionHash = `0x${"55".repeat(32)}`;
    const current = {
      submission: {
        id: "550e8400-e29b-41d4-a716-446655440000", state: "current", executable: true,
        owner: "0x1111111111111111111111111111111111111111", solverId: "cobia-reference",
        revision: 2, programHash: `0x${"11".repeat(32)}`, validUntil: "2033-05-18T03:35:00Z",
        blockNumber: "123", blockHash: `0x${"22".repeat(32)}`, displayGoal: "Swap USDG",
        failureCodes: [],
      },
      artifacts: {
        program: { payload: { actions: [{ capabilityId: "curve-stableswap-ng.exact-input",
          parameters: { tokenIn: "0x3333333333333333333333333333333333333333",
            tokenOut: "0x2222222222222222222222222222222222222222" } }] } },
        replay: { payload: { reproduced: true } },
      },
    };
    let receiptAttempts = 0;
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/execution/receipt")) {
        receiptAttempts += 1;
        return receiptAttempts === 1
          ? new Response(JSON.stringify({ message: "Could not attribute execution receipt." }), { status: 409 })
          : new Response(JSON.stringify({ state: "confirmed", receipt: {
            version: 3, transactionHash, blockNumber: "124",
          } }));
      }
      if (url.endsWith("/execution")) return new Response(JSON.stringify({
        chainId: 196, approvals: [],
        execution: { to: "0x2222222222222222222222222222222222222222", data: "0x1234", value: "0x0" },
      }));
      return new Response(JSON.stringify(receiptAttempts > 1 ? {
        ...current,
        submission: { ...current.submission, state: "executed", executable: false },
        artifacts: { ...current.artifacts, receipt: { payload: {
          version: 3, transactionHash, blockNumber: "124",
        } } },
      } : current));
    });
    let lastTransaction: Record<string, string> | undefined;
    wallet.request.mockImplementation(async ({ method, params }: { method: string; params?: unknown[] }) => {
      if (method === "personal_sign") return `0x${"33".repeat(65)}`;
      if (method === "eth_sendTransaction") {
        lastTransaction = (params?.[0] ?? {}) as Record<string, string>;
        return transactionHash;
      }
      if (method === "eth_getTransactionReceipt") return { status: "0x1", blockNumber: "0x7b" };
      if (method === "eth_getTransactionByHash") return {
        from: lastTransaction?.from, to: lastTransaction?.to,
        input: lastTransaction?.data, value: lastTransaction?.value,
      };
      if (method === "eth_blockNumber") return "0x7c";
      throw new Error(`Unexpected wallet method ${method}`);
    });

    render(<AgentProgramView programId="550e8400-e29b-41d4-a716-446655440000" />);
    fireEvent.click(await screen.findByRole("button", { name: "Prepare execution" }));

    const retry = await screen.findByRole("button", { name: "Retry receipt verification" });
    expect(wallet.request.mock.calls.filter(
      ([request]) => request.method === "eth_sendTransaction",
    )).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Swap now" })).not.toBeInTheDocument();
    fireEvent.click(retry);

    expect(await screen.findByText("Swap complete")).toBeVisible();
    expect(receiptAttempts).toBe(2);
    expect(wallet.request.mock.calls.filter(
      ([request]) => request.method === "eth_sendTransaction",
    )).toHaveLength(1);
  });
});
