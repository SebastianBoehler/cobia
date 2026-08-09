// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { quoteSelectionCommitment } from "../../lib/intents/commitments";
import { CompetitionView } from "./CompetitionView";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const quoteId = `0x${"ab".repeat(32)}`;
const owner = "0x1111111111111111111111111111111111111111";
const market = {
  requestId,
  state: "quotes_ready",
  policy: {
    version: 1,
    requestId,
    owner,
    executionChainId: 196,
    asset: "0x4ae46a509F6b1D9056937BA4500cb143933D2dc8",
    principalAtomic: "25000000000",
    maxProtocolExposureBps: 4_000,
    minTvlUsdE6: "250000000000",
    minNetApyBps: 200,
    maxSnapshotAgeSec: 300,
    deadline: 2_000_000_000,
    noBridges: true,
  },
  snapshot: null,
  selectedQuoteId: null,
  quotes: [{
    version: 1,
    quoteId,
    requestId,
    solverId: "determinist",
    solverAddress: owner,
    bundleHash: quoteId,
    expectedNetApyBps: 256,
    riskGrade: "low",
    priceAtomic: "100000",
    validUntil: 2_000_000_000,
    verification: { executable: true, errorCodes: [], score: 256 },
  }],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CompetitionView", () => {
  it("requires the owner wallet signature before selecting a quote", async () => {
    const request = vi.fn().mockResolvedValue(`0x${"cd".repeat(65)}`);
    Object.defineProperty(window, "ethereum", { configurable: true, value: { request } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(market))
      .mockResolvedValueOnce(Response.json({ state: "selected" }))
      .mockResolvedValueOnce(Response.json({ ...market, state: "selected", selectedQuoteId: quoteId }));
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionView requestId={requestId} />);
    fireEvent.click(await screen.findByRole("button", { name: "Select quote" }));

    await waitFor(() => expect(request).toHaveBeenCalledWith({
      method: "personal_sign",
      params: [quoteSelectionCommitment(requestId, quoteId), owner],
    }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      quoteId,
      ownerSignature: `0x${"cd".repeat(65)}`,
    });
  });
});
