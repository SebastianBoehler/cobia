// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  INTENT_ASSETS,
  NATIVE_INTENT_ASSET,
} from "../../lib/intents/capability-templates";
import { PolicyReceiptEditor } from "./PolicyReceiptEditor";

afterEach(cleanup);

describe("PolicyReceiptEditor", () => {
  it("renders the canonical native input instead of visually falling back to a stablecoin", () => {
    const { rerender } = render(<PolicyReceiptEditor owner={null} onChange={vi.fn()} values={{
      templateId: "exact-input-swap",
      inputToken: NATIVE_INTENT_ASSET.address,
      outputToken: INTENT_ASSETS[0]!.address,
      amount: "0.01",
      minimum: "1",
      maxSolverFeeUsd: "0",
      jurisdiction: "",
      eligibilityAccepted: false,
    }} />);

    expect(screen.getByRole("combobox", { name: "Input asset" })).toHaveValue(
      NATIVE_INTENT_ASSET.address,
    );
    expect(screen.getByText("0.01 OKB")).toBeVisible();

    rerender(<PolicyReceiptEditor owner={null} onChange={vi.fn()} values={{
      templateId: "exact-input-swap",
      inputToken: INTENT_ASSETS[0]!.address,
      outputToken: NATIVE_INTENT_ASSET.address,
      amount: "1",
      minimum: "0.008",
      maxSolverFeeUsd: "0",
      jurisdiction: "",
      eligibilityAccepted: false,
    }} />);
    expect(screen.getByRole("combobox", { name: "Output asset" })).toHaveValue(
      NATIVE_INTENT_ASSET.address,
    );
  });
});
