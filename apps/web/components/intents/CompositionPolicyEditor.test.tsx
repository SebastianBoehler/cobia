// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { INTENT_ASSETS } from "../../lib/intents/capability-templates";
import type { ComposedIntentDraft } from "../../lib/intents/composition-draft";
import { CompositionPolicyEditor } from "./CompositionPolicyEditor";

afterEach(cleanup);

const values: ComposedIntentDraft = {
  kind: "composed" as const,
  inputToken: INTENT_ASSETS[0]!.address,
  amount: "1",
  capabilityIds: [
    "aave-v3.supply",
    "curve-stableswap-ng.exact-input",
    "uniswap-v3.exact-input",
  ],
  maxConversionLossBps: 100,
  minimumReceiptValueBps: 9_900,
  minimumReceiptSource: "conversion-loss" as const,
  horizonDays: 30,
  horizonSource: "product-default" as const,
  competitionDurationSec: 300,
  deadlineDurationSec: 600,
};

describe("CompositionPolicyEditor", () => {
  it("shows the registered actions, hard constraints, and timing authority", () => {
    render(<CompositionPolicyEditor owner={null} values={values} onChange={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Registered composition" })).toBeVisible();
    expect(screen.getByText("Aave V3 supply")).toBeVisible();
    expect(screen.getByText("Curve StableSwap NG exact input")).toBeVisible();
    expect(screen.getByText("Uniswap V3 exact input")).toBeVisible();
    expect(screen.getByLabelText("Maximum conversion loss (%)")).toHaveValue(1);
    expect(screen.getByLabelText(/^Minimum registered receipt value/)).toHaveValue(99);
    expect(screen.getByLabelText(/^Objective horizon/)).toHaveValue(30);
    expect(screen.getByLabelText("Competition (minutes)")).toHaveValue(5);
    expect(screen.getByLabelText("Execution deadline (minutes)")).toHaveValue(10);
    expect(screen.getByText(/Derived from the 1% conversion-loss ceiling/)).toBeVisible();
  });

  it("keeps a changed loss ceiling and its derived receipt floor aligned", () => {
    const onChange = vi.fn();
    render(<CompositionPolicyEditor owner={null} values={values} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Maximum conversion loss (%)"), {
      target: { value: "0.5" },
    });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      maxConversionLossBps: 50,
      minimumReceiptValueBps: 9_950,
      minimumReceiptSource: "conversion-loss",
    }));
  });
});
