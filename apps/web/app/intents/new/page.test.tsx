import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ getActive: vi.fn() }));

vi.mock("@/components/layout/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("@/components/intents/IntentComposer", () => ({
  IntentComposer: ({ initialDraft, initialGoal }: {
    initialDraft?: { goal: string }; initialGoal?: string;
  }) => (
    <div>Intent composer{initialDraft ? `: ${initialDraft.goal}` : initialGoal ? `: ${initialGoal}` : ""}</div>
  ),
}));
vi.mock("../../../lib/runtime/market", () => ({
  getChallengeRepository: () => ({ getActive: state.getActive }),
}));

import NewIntentPage from "./page";

describe("new intent page", () => {
  it("frames the composer as a general onchain request", async () => {
    const page = await NewIntentPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);
    expect(html).toContain("Describe the outcome");
    expect(html).toContain("Intent composer");
    expect(html).not.toMatch(/Earn|Swap|Profit/);
  });

  it("loads a standing challenge as an unsigned typed draft", async () => {
    state.getActive.mockResolvedValue({
      displayGoal: "Supply 10 USDG with a bounded receipt-token floor.",
      policyTemplate: {
        version: 1,
        capabilityTemplateId: "aave-supply",
        parameters: {
          inputToken: "0x4AE46a509f6B1d9056937Ba4500cB143933d2DC8",
          amount: "10",
        },
      },
    });

    const page = await NewIntentPage({
      searchParams: Promise.resolve({ challenge: "bounded-usdg-aave-supply" }),
    });
    const html = renderToStaticMarkup(page);

    expect(state.getActive).toHaveBeenCalledWith("bounded-usdg-aave-supply");
    expect(html).toContain("Intent composer: Supply 10 USDG with a bounded receipt-token floor.");
  });

  it("carries a landing-page prompt into the general composer", async () => {
    const page = await NewIntentPage({
      searchParams: Promise.resolve({ goal: "Swap 10 @USDG into @USDt0" }),
    });
    expect(renderToStaticMarkup(page)).toContain("Intent composer: Swap 10 @USDG into @USDt0");
  });
});
