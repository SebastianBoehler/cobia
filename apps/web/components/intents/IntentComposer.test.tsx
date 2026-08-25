// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { commitment } from "@cobia/domain";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IntentComposer } from "./IntentComposer";
import {
  DEFAULT_INTENT_RECEIPT_VALUES, INTENT_ASSETS, RWA_INTENT_ASSETS,
} from "../../lib/intents/capability-templates";

const owner = "0x1111111111111111111111111111111111111111";
const state = vi.hoisted(() => ({
  push: vi.fn(), request: vi.fn(), switchChain: vi.fn(), switchToXLayer: vi.fn(),
  account: "0x1111111111111111111111111111111111111111" as `0x${string}` | null,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock("../wallet/WalletProvider", () => ({
  useWallet: () => ({
    account: state.account, chainId: 196, targetChainId: 196,
    request: state.request, switchChain: state.switchChain, switchToXLayer: state.switchToXLayer,
  }),
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
beforeEach(() => {
  state.account = owner;
  state.push.mockReset();
  state.request.mockReset().mockResolvedValue(`0x${"ab".repeat(65)}`);
  state.switchChain.mockReset().mockResolvedValue(undefined);
  state.switchToXLayer.mockReset().mockResolvedValue(undefined);
  vi.restoreAllMocks();
});

describe("IntentComposer", () => {
  it("starts with only the human goal before revealing policy fields", () => {
    render(<IntentComposer />);

    expect(screen.getByLabelText("What should happen?")).toBeVisible();
    expect(screen.getByRole("button", { name: "Review policy" })).toBeDisabled();
    expect(screen.getByLabelText("Action type")).toHaveValue("any");
    expect(screen.getByText("Mention")).toBeVisible();
    expect(screen.getByText("Routes")).toBeVisible();
    expect(screen.getByLabelText("Example intents")).toBeVisible();
    expect(screen.queryByLabelText("Verified capability")).not.toBeInTheDocument();
    expect(screen.queryByText("Unsigned draft")).not.toBeInTheDocument();
  });

  it("fills the goal from a tagged example and then hides the examples", () => {
    render(<IntentComposer />);

    fireEvent.click(screen.getByRole("button", {
      name: "Use example: Swap 10 @USDG into at least 9.95 @USDt0 on @XLayer",
    }));

    expect(screen.getByLabelText("What should happen?")).toHaveValue(
      "Swap 10 @USDG into at least 9.95 @USDt0 on @XLayer",
    );
    expect(screen.queryByLabelText("Example intents")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review policy" })).toBeEnabled();
    expect(screen.queryByLabelText("Attached entities")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("intent-goal-highlight")).getByText("@USDG")).toBeVisible();
    expect(within(screen.getByTestId("intent-goal-highlight")).getByText("@XLayer")).toBeVisible();
  });

  it("tags exact known asset symbols when intent text is pasted", () => {
    render(<IntentComposer />);
    const goal = screen.getByLabelText("What should happen?");

    fireEvent.paste(goal, {
      clipboardData: { getData: () => "0.01 OKB into USDG" },
    });

    expect(goal).toHaveValue("0.01 @OKB into @USDG");
    expect(screen.queryByLabelText("Detected assets")).not.toBeInTheDocument();
  });

  it("keeps every pre-V4 example on the currently public lane", () => {
    render(<IntentComposer />);

    expect(within(screen.getByLabelText("Example intents"))
      .queryByRole("button", { name: /@TSLAx/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name:
      "Use example: Turn 0.1 @USDG into @OKB using at least 2 wallet steps on @XLayer" }));

    expect(screen.getByLabelText("What should happen?")).toHaveValue(
      "Turn 0.1 @USDG into @OKB using at least 2 wallet steps on @XLayer",
    );
  });

  it("offers the xStocks showcase only after V4 is publicly live", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => url === "/api/network/status"
      ? Promise.resolve(Response.json({ state: "live", activationAt: 0,
        v4: { state: "live", activationAt: 0 } }))
      : Promise.resolve(Response.json({}))));
    render(<IntentComposer />);

    const example = await screen.findByRole("button", {
      name: "Use example: Acquire at least 0.01 @TSLAx with at most 10 @USDG on @XLayer",
    });
    fireEvent.click(example);

    expect(screen.getByLabelText("What should happen?")).toHaveValue(
      "Acquire at least 0.01 @TSLAx with at most 10 @USDG on @XLayer",
    );
    expect(within(screen.getByTestId("intent-goal-highlight")).getByText("@TSLAx")).toBeVisible();
  });

  it("recognizes typed tags inline without repeating attached-entity cards", () => {
    render(<IntentComposer />);

    fireEvent.change(screen.getByLabelText("What should happen?"), {
      target: { value: "Supply 10 @USDG to @Aave on @XLayer" },
    });

    expect(screen.queryByLabelText("Attached entities")).not.toBeInTheDocument();
    expect(screen.getByTestId("intent-goal-highlight").querySelectorAll("strong")).toHaveLength(3);
  });

  it("opens mention suggestions for bare @ and replaces the partial mention", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("intent-goal__input") ? 600 : 0;
    });
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("intent-caret-anchor") ? 72 : 0;
    });
    vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("intent-caret-anchor") ? 20 : 0;
    });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("intent-caret-anchor") ? 29 : 0;
    });
    render(<IntentComposer />);

    fireEvent.change(screen.getByLabelText("What should happen?"), { target: { value: "@" } });

    const suggestions = screen.getByRole("listbox", { name: "Mention suggestions" });
    expect(suggestions).toHaveStyle({ left: "72px", top: "53px", width: "360px" });
    expect(within(suggestions).getByRole("option", { name: /@USDG/ })).toBeVisible();
    fireEvent.click(within(suggestions).getByRole("option", { name: /@USDG/ }));
    expect(screen.getByLabelText("What should happen?")).toHaveValue("@USDG ");
  });

  it("normalizes the same Tesla contract from the wallet, registry, and catalog into one suggestion", async () => {
    const tesla = RWA_INTENT_ASSETS.find(({ symbol }) => symbol === "TSLAx")!;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/portfolio")) return Promise.resolve(Response.json({ balances: [{
        symbol: "TSLAx", address: tesla.address, amountAtomic: "16002000000000000", formatted: "0.016002",
        priceUsd: "350.8502",
      }], positions: [] }));
      if (url === "/api/assets/resolve") {
        const body = JSON.parse(String(init?.body));
        return Promise.resolve(Response.json("query" in body ? { assets: [{
          symbol: "TSLAx", name: "Tesla xStock", chainId: 196, address: tesla.address,
          status: "catalog-backed",
        }] } : { assets: [], unresolved: ["TS"] }));
      }
      return Promise.resolve(Response.json({}));
    }));
    render(<IntentComposer />);
    const goal = screen.getByLabelText("What should happen?");

    fireEvent.focus(goal);
    fireEvent.change(goal, { target: { value: "@TS" } });

    const suggestions = await screen.findByRole("listbox", { name: "Mention suggestions" });
    await waitFor(() => expect(within(suggestions).getAllByRole("option", { name: /@TSLAx/ })).toHaveLength(1));
  });

  it("accepts the first mention suggestion with Tab and keeps the goal focused", () => {
    render(<IntentComposer />);
    const goal = screen.getByLabelText("What should happen?");
    goal.focus();
    fireEvent.change(goal, { target: { value: "@USD" } });

    const shouldContinue = fireEvent.keyDown(goal, { key: "Tab" });

    expect(shouldContinue).toBe(false);
    expect(goal).toHaveValue("@USDG ");
    expect(goal).toHaveFocus();
  });

  it("moves through mention suggestions with arrow keys and exposes the active option", () => {
    render(<IntentComposer />);
    const goal = screen.getByLabelText("What should happen?");
    fireEvent.change(goal, { target: { value: "@" } });
    const suggestions = screen.getByRole("listbox", { name: "Mention suggestions" });
    const options = within(suggestions).getAllByRole("option");

    expect(goal).toHaveAttribute("role", "combobox");
    expect(goal).toHaveAttribute("aria-controls", suggestions.id);
    expect(goal).toHaveAttribute("aria-expanded", "true");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(goal).toHaveAttribute("aria-activedescendant", options[0].id);

    fireEvent.keyDown(goal, { key: "ArrowDown" });
    expect(options[0]).toHaveAttribute("aria-selected", "false");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(goal).toHaveAttribute("aria-activedescendant", options[1].id);

    fireEvent.keyDown(goal, { key: "ArrowUp" });
    fireEvent.keyDown(goal, { key: "ArrowUp" });
    expect(options.at(-1)).toHaveAttribute("aria-selected", "true");
    expect(goal).toHaveAttribute("aria-activedescendant", options.at(-1)?.id);
  });

  it.each(["Enter", "Tab"])("accepts the active mention suggestion with %s", (key) => {
    render(<IntentComposer />);
    const goal = screen.getByLabelText("What should happen?");
    goal.focus();
    fireEvent.change(goal, { target: { value: "@" } });
    const options = within(screen.getByRole("listbox", { name: "Mention suggestions" }))
      .getAllByRole("option");
    const selectedMention = options[1].querySelector("strong")?.textContent;

    fireEvent.keyDown(goal, { key: "ArrowDown" });
    const shouldContinue = fireEvent.keyDown(goal, { key });

    expect(shouldContinue).toBe(false);
    expect(goal).toHaveValue(`${selectedMention} `);
    expect(goal).toHaveFocus();
    expect(screen.queryByRole("listbox", { name: "Mention suggestions" })).not.toBeInTheDocument();
  });

  it("dismisses mention suggestions with Escape without changing the goal", () => {
    render(<IntentComposer />);
    const goal = screen.getByLabelText("What should happen?");
    fireEvent.change(goal, { target: { value: "@USD" } });
    expect(screen.getByRole("listbox", { name: "Mention suggestions" })).toBeVisible();

    const shouldContinue = fireEvent.keyDown(goal, { key: "Escape" });

    expect(shouldContinue).toBe(false);
    expect(goal).toHaveValue("@USD");
    expect(goal).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox", { name: "Mention suggestions" })).not.toBeInTheDocument();

    fireEvent.change(goal, { target: { value: "No mention" } });
    fireEvent.change(goal, { target: { value: "@USD" } });
    expect(screen.getByRole("listbox", { name: "Mention suggestions" })).toBeVisible();
  });

  it("returns focus to the goal after clicking a mention suggestion", () => {
    render(<IntentComposer />);
    const goal = screen.getByLabelText("What should happen?");
    fireEvent.change(goal, { target: { value: "@USD" } });
    const suggestion = within(screen.getByRole("listbox", { name: "Mention suggestions" }))
      .getByRole("option", { name: /@USDG/ });
    suggestion.focus();

    fireEvent.click(suggestion);

    expect(goal).toHaveValue("@USDG ");
    expect(goal).toHaveFocus();
  });

  it("shows the canonical contract and exact USD price while typing a known token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url === "/api/assets/resolve") return Promise.resolve(Response.json({ assets: [{
        symbol: "USDG", address: INTENT_ASSETS[0].address, priceUsd: "0.9998",
      }], unresolved: [] }));
      if (url.includes("/portfolio")) return Promise.resolve(Response.json({ balances: [{
        symbol: "USDG", formatted: "2.5",
      }] }));
      return Promise.resolve(Response.json({ offers: [] }));
    }));
    render(<IntentComposer />);

    fireEvent.change(screen.getByLabelText("What should happen?"), { target: { value: "@USDG" } });

    const suggestions = await screen.findByRole("listbox", { name: "Mention suggestions" });
    expect(await within(suggestions).findByRole("option", {
      name: /@USDG.*0x4ae4…2dc8.*\$0\.9998.*Balance 2\.5 USDG/i,
    })).toBeVisible();
  });

  it("loads spendable wallet balances on mount and inserts an available asset", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/portfolio")) return Promise.resolve(Response.json({
        native: { symbol: "OKB", amountAtomic: "50000000000000000", formatted: "0.05" },
        balances: [
          { symbol: "USDG", amountAtomic: "1000000", formatted: "1" },
          { symbol: "USDt0", amountAtomic: "0", formatted: "0" },
        ], positions: [],
      }));
      if (url === "/api/assets/resolve") return Promise.resolve(Response.json({ assets: [
        { symbol: "OKB", priceUsd: "100" }, { symbol: "USDG", priceUsd: "1" },
      ] }));
      return Promise.resolve(Response.json({ offers: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<IntentComposer />);

    const rail = await screen.findByRole("region", { name: "Available wallet assets" });
    expect(within(rail).getByRole("button", { name: /add @okb to goal.*0\.05 okb.*\$5\.00/i })).toBeVisible();
    expect(within(rail).getByRole("button", { name: /add @usdg to goal.*1 usdg.*\$1\.00/i })).toBeVisible();
    expect(within(rail).queryByRole("button", { name: /@usdt0/i })).not.toBeInTheDocument();
    expect(within(rail).getByText("OKB")).toHaveTextContent("OKB");
    expect(within(rail).getByText("$5.00")).toBeVisible();

    fireEvent.focus(screen.getByLabelText("What should happen?"));
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/portfolio"))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/assets/resolve")).toHaveLength(1);

    fireEvent.click(within(rail).getByRole("button", { name: /add @usdg to goal/i }));
    expect(screen.getByLabelText("What should happen?")).toHaveValue("@USDG ");
    expect(screen.getByLabelText("What should happen?")).toHaveFocus();
  });

  it("highlights any token mention and identifies catalog-backed xStocks", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(Response.json({ assets: [{
      symbol: "AAPLx", name: "Apple xStock", chainId: 196,
      address: "0x1111111111111111111111111111111111111111", status: "catalog-backed",
    }], unresolved: [] }))));
    render(<IntentComposer />);

    fireEvent.change(screen.getByLabelText("What should happen?"), {
      target: { value: "Research a route to @AAPLx" },
    });

    expect(within(screen.getByTestId("intent-goal-highlight")).getByText("@AAPLx")).toBeVisible();
    expect(await within(await screen.findByRole("listbox", { name: "Mention suggestions" }))
      .findByRole("option", { name: /@AAPLx.*0x1111…1111.*Price unavailable/ })).toBeVisible();
  });

  it("marks a token in the goal when fresh resolution rejects it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() =>
      Promise.resolve(Response.json({ assets: [], unresolved: ["FAKE"] }))));
    render(<IntentComposer />);

    fireEvent.change(screen.getByLabelText("What should happen?"), {
      target: { value: "Swap 1 @FAKE into @USDG" },
    });

    await waitFor(() => expect(within(screen.getByTestId("intent-goal-highlight"))
      .getByText("@FAKE")).toHaveClass("intent-mention--unresolved"));
    expect(within(screen.getByTestId("intent-goal-highlight"))
      .getByText("@USDG")).not.toHaveClass("intent-mention--unresolved");
    expect(screen.getByRole("button", { name: "Review policy" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Choose a supported token for @FAKE before review.",
    );
  });

  it("fails closed when token identity resolution is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.reject(new Error("offline"))));
    render(<IntentComposer />);

    fireEvent.change(screen.getByLabelText("What should happen?"), {
      target: { value: "Swap 1 @EXAMPLE into @USDG" },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Token identity could not be verified. Try again before review.",
    );
    expect(screen.getByRole("button", { name: "Review policy" })).toBeDisabled();
  });

  it("shows OKX contract and price evidence on a resolved token mention", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(Response.json({ assets: [{
      symbol: "EXAMPLE", name: "Example Token", chainId: 196,
      address: "0x2222222222222222222222222222222222222222", status: "research-only",
      priceUsd: "2.50", liquidityUsd: "100000", holderCount: "1200",
    }], unresolved: [] }))));
    render(<IntentComposer />);

    fireEvent.change(screen.getByLabelText("What should happen?"), {
      target: { value: "Research @EXAMPLE" },
    });

    const suggestion = await within(await screen.findByRole("listbox", { name: "Mention suggestions" }))
      .findByRole("option", { name: /@EXAMPLE.*0x2222…2222.*\$2.50/ });
    expect(suggestion).toBeVisible();
  });

  it("closes mention and route popovers on an outside click", () => {
    render(<IntentComposer />);
    const goal = screen.getByLabelText("What should happen?");

    for (const name of ["Mention", "Routes"]) {
      const summary = screen.getByText(name);
      const details = summary.closest("details");
      fireEvent.click(summary);
      expect(details).toHaveAttribute("open");
      fireEvent.pointerDown(goal);
      expect(details).not.toHaveAttribute("open");
    }
  });

  it("renders a mark beside every mention and route option", () => {
    render(<IntentComposer />);

    fireEvent.click(screen.getByText("Mention"));
    const mentionMenu = screen.getByText("Assets").closest(".intent-mention-menu");
    expect(mentionMenu).not.toBeNull();
    if (!mentionMenu) throw new Error("Mention menu is unavailable");
    expect(mentionMenu.querySelectorAll("button")).toHaveLength(
      mentionMenu.querySelectorAll(".intent-option-mark").length,
    );

    fireEvent.click(screen.getByText("Routes"));
    expect(document.querySelectorAll(".intent-route-control__menu label .intent-option-mark")).toHaveLength(3);
  });

  it("closes execution settings with Escape and restores trigger focus", () => {
    render(<IntentComposer />);
    const trigger = screen.getByRole("button", { name: /Settings: 3% maximum slippage/ });

    fireEvent.click(trigger);
    const slippage = screen.getByLabelText("Maximum slippage (%)");
    slippage.focus();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("group", { name: "Execution protection" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("compiles the goal before showing editable signed bounds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("/portfolio")) return Promise.resolve(Response.json({ balances: [], positions: [] }));
      if (url === "/api/assets/resolve") return Promise.resolve(Response.json({ assets: [] }));
      return Promise.resolve(Response.json({ status: "review", values: DEFAULT_INTENT_RECEIPT_VALUES }));
    }));
    render(<IntentComposer />);

    fireEvent.change(screen.getByLabelText("What should happen?"), {
      target: { value: "Put 10 USDG into a bounded Aave position." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review policy" }));

    const compileCall = (fetch as ReturnType<typeof vi.fn>).mock.calls
      .find(([url]) => url === "/api/intents/compile")!;
    expect(JSON.parse(compileCall[1].body)).toMatchObject({
      owner, actionPreference: "any",
    });

    expect(await screen.findByRole("heading", { name: "Review the policy" })).toBeVisible();
    expect(screen.getByLabelText("Verified capability")).toHaveValue("aave-supply");
    expect(screen.getByText("No solver fee during launch")).toBeVisible();
    expect(screen.queryByLabelText("Maximum solver success fee")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit goal" })).toBeVisible();
  });

  it("routes a resolved ERC-20 or xStock through exact V4 asset authority", async () => {
    const adbe = "0x1111111111111111111111111111111111111111";
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/portfolio")) return Promise.resolve(Response.json({ balances: [], positions: [] }));
      if (url === "/api/assets/resolve") return Promise.resolve(Response.json({ assets: [{
        symbol: "ADBEx", name: "Adobe xStock", chainId: 196, address: adbe, decimals: 18,
        status: "catalog-backed",
      }], unresolved: [] }));
      if (url === "/api/intents/compile") {
        return Promise.resolve(Response.json({ status: "review", values: {
          kind: "general-asset-draft", templateId: "general-asset", displayGoal: "Buy ADBEx",
          sourceChainId: 196, destinationChainId: 196, manifestHash: `0x${"11".repeat(32)}`,
          evidenceExpiresAtSec: 2_000_000_300,
          input: { token: INTENT_ASSETS[0].address, symbol: "USDG", decimals: 6,
            maximumAtomic: "20000", maximumUsdE8: "200000000", identityHash: `0x${"12".repeat(32)}`,
            valuationHash: `0x${"13".repeat(32)}` },
          output: { token: adbe, symbol: "ADBEx", decimals: 18, minimumAtomic: "100000000000000",
            identityHash: `0x${"14".repeat(32)}` },
          allowedAdapters: [], limits: { maxStages: 8, maxCallsPerStage: 8, maxApprovals: 16,
            maxCalldataBytes: 16384, maxGasPerStage: "4000000", maxNativeValueUsdE8: "1000000000",
            maxBridgeFeeUsdE8: "5000000000", maxSolverFeeUsdE8: "0", maxConversionLossBps: 500,
            maxSlippageBps: 300 },
        } }));
      }
      return Promise.resolve(Response.json({}));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<IntentComposer />);

    fireEvent.change(screen.getByLabelText("What should happen?"), { target: {
      value: "Buy at least 0.0001 @ADBEx with 0.02 @USDG",
    } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Review policy" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Review policy" }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === "/api/intents/compile")).toBe(true));
    const compile = fetchMock.mock.calls.find(([url]) => url === "/api/intents/compile")!;
    expect(JSON.parse(String(compile[1].body))).toMatchObject({ generalAsset: {
      input: { chainId: 196, address: INTENT_ASSETS[0].address, maximumAtomic: "20000" },
      output: { chainId: 196, address: adbe, minimumAtomic: "100000000000000" },
    } });
  });

  it("binds a natural-language full-balance input to the exact portfolio token", async () => {
    const adbe = "0x1111111111111111111111111111111111111111";
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/portfolio")) return Promise.resolve(Response.json({ balances: [{
        symbol: "USDG", address: INTENT_ASSETS[0].address, decimals: 6,
        amountAtomic: "2289644", formatted: "2.289644",
      }], positions: [] }));
      if (url === "/api/assets/resolve") return Promise.resolve(Response.json({ assets: [{
        symbol: "ADBEx", name: "Adobe xStock", chainId: 196, address: adbe, decimals: 18,
        status: "catalog-backed",
      }], unresolved: [] }));
      if (url === "/api/intents/compile") return Promise.resolve(Response.json({
        status: "clarification", question: "Captured",
      }));
      return Promise.resolve(Response.json({}));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<IntentComposer />);

    const rail = await screen.findByRole("region", { name: "Available wallet assets" });
    expect(within(rail).getByRole("button", { name: /add @usdg to goal.*2\.289644 usdg/i })).toBeVisible();
    fireEvent.click(screen.getByLabelText(/Settings: 3% maximum slippage/));
    fireEvent.change(screen.getByLabelText("Maximum slippage (%)"), { target: { value: "1.5" } });
    fireEvent.change(screen.getByLabelText("Output protection margin (%)"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("What should happen?"), { target: {
      value: "with all @USDG buy me at least 0.01 @ADBEx",
    } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Review policy" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Review policy" }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === "/api/intents/compile")).toBe(true));
    const compile = fetchMock.mock.calls.find(([url]) => url === "/api/intents/compile")!;
    expect(JSON.parse(String(compile[1].body))).toMatchObject({
      settings: { maxSlippageBps: 150, marketMarginBps: 200 },
      generalAsset: {
        input: { chainId: 196, address: INTENT_ASSETS[0].address, maximumAtomic: "2289644" },
        output: { chainId: 196, address: adbe, minimumAtomic: "10000000000000000" },
      },
    });
  });

  it("does not expose a JSON parser error when compilation returns plain text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("/portfolio")) return Promise.resolve(Response.json({ balances: [], positions: [] }));
      if (url === "/api/assets/resolve") return Promise.resolve(Response.json({ assets: [] }));
      if (url === "/api/intents/compile") {
        return Promise.resolve(new Response("An error occurred", { status: 502,
          headers: { "content-type": "text/plain" } }));
      }
      return Promise.resolve(Response.json({}));
    }));
    render(<IntentComposer />);

    fireEvent.change(screen.getByLabelText("What should happen?"), { target: { value:
      "Acquire at least 0.01 @TSLAx with at most 10 @USDG on @XLayer" } });
    fireEvent.click(screen.getByRole("button", { name: "Review policy" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The policy draft could not be compiled. Try again.",
    );
  });

  it("requires a connected signing wallet before interpretation", () => {
    state.account = null;
    render(<IntentComposer />);
    fireEvent.change(screen.getByLabelText("What should happen?"), {
      target: { value: "Supply 10 USDG to Aave" },
    });

    expect(screen.getByRole("button", { name: "Review policy" })).toBeDisabled();
    expect(screen.getByText(/Connect a signing wallet/)).toBeVisible();
  });

  it("authenticates the wallet once when the compiler session is missing", async () => {
    let compileCalls = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/portfolio")) return Promise.resolve(Response.json({ balances: [], positions: [] }));
      if (url === "/api/assets/resolve") return Promise.resolve(Response.json({ assets: [] }));
      if (url === "/api/intents/compile") {
        compileCalls += 1;
        return compileCalls === 1
          ? Promise.resolve(Response.json({ code: "WALLET_AUTH_REQUIRED" }, { status: 401 }))
          : Promise.resolve(Response.json({ status: "review", values: DEFAULT_INTENT_RECEIPT_VALUES }));
      }
      if (url === "/api/wallet-auth/challenge") {
        return Promise.resolve(Response.json({ nonce: "aa".repeat(32), message: "Verify Cobia wallet" }));
      }
      if (url === "/api/intents/readiness") {
        return Promise.resolve(Response.json({ missingNativeBalanceChainIds: [] }));
      }
      return Promise.resolve(Response.json({ owner, expiresAt: 2_000_000_900 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<IntentComposer />);
    fireEvent.change(screen.getByLabelText("What should happen?"), {
      target: { value: "Supply 10 USDG to Aave" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review policy" }));

    expect(await screen.findByRole("heading", { name: "Review the policy" })).toBeVisible();
    expect(fetchMock.mock.calls.map(([url]) => url).filter((url) => [
      "/api/intents/compile", "/api/wallet-auth/challenge", "/api/wallet-auth/session",
    ].includes(url))).toEqual([
      "/api/intents/compile", "/api/wallet-auth/challenge",
      "/api/wallet-auth/session", "/api/intents/compile",
    ]);
    expect(state.request).toHaveBeenCalledWith(expect.objectContaining({ method: "personal_sign" }));
  });

  it("starts from a challenge draft but creates fresh wallet-bound authority", async () => {
    const randomUUID = vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440001")
      .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440002");
    const fetchMock = vi.fn().mockImplementation((url: string) => url === "/api/intents/readiness"
      ? Promise.resolve(Response.json({ missingNativeBalanceChainIds: [] }))
      : Promise.resolve(Response.json({
        links: { intent: "/intents/550e8400-e29b-41d4-a716-446655440001" },
      }, { status: 202 })));
    vi.stubGlobal("fetch", fetchMock);
    render(<IntentComposer initialDraft={{
      goal: "Exchange 10 USDG for at least 9.95 USDt0.",
      values: {
        jurisdiction: "DE", eligibilityAccepted: false,
        templateId: "exact-input-swap",
        inputToken: INTENT_ASSETS[0].address,
        outputToken: INTENT_ASSETS[1].address,
        amount: "10",
        minimum: "9.95",
        maxSolverFeeUsd: "0.10",
      },
    }} />);

    expect(screen.getByText("Exchange 10 USDG for at least 9.95 USDt0.")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign and publish intent" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Sign and publish intent" }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === "/api/intents")).toBe(true));
    const publishCall = fetchMock.mock.calls.find(([url]) => url === "/api/intents")!;
    const body = JSON.parse(String(publishCall[1].body));
    expect(body.policy).toMatchObject({
      requestId: "550e8400-e29b-41d4-a716-446655440001",
      owner,
      displayGoal: "Exchange 10 USDG for at least 9.95 USDt0.",
    });
    expect(body.policy).not.toHaveProperty("challengeId");
    expect(body).toEqual({ policy: expect.any(Object), ownerSignature: expect.any(String) });
    expect(randomUUID).toHaveBeenCalledTimes(2);
  });

  it("signs the rendered open policy commitment and publishes to the canonical API", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => url === "/api/intents/compile"
      ? Promise.resolve(Response.json({ status: "review", values: DEFAULT_INTENT_RECEIPT_VALUES }))
      : url === "/api/intents/readiness"
        ? Promise.resolve(Response.json({ missingNativeBalanceChainIds: [] }))
      : Promise.resolve(Response.json({
        intentId: "550e8400-e29b-41d4-a716-446655440000",
        policyHash: `0x${"cd".repeat(32)}`, state: "collecting",
        links: { intent: "/intents/550e8400-e29b-41d4-a716-446655440000" },
      }, { status: 202 })));
    vi.stubGlobal("fetch", fetchMock);
    render(<IntentComposer />);

    fireEvent.change(screen.getByLabelText("What should happen?"), {
      target: { value: "Put 10 USDG into a bounded Aave position." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review policy" }));
    await screen.findByRole("heading", { name: "Review the policy" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign and publish intent" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Sign and publish intent" }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === "/api/intents")).toBe(true));
    const publishCall = fetchMock.mock.calls.find(([url]) => url === "/api/intents")!;
    const body = JSON.parse(String(publishCall[1].body));
    expect(fetchMock).toHaveBeenCalledWith("/api/intents", expect.objectContaining({ method: "POST" }));
    expect(state.request).toHaveBeenCalledWith({
      method: "personal_sign", params: [commitment(body.policy), owner],
    });
    expect(body.policy).toMatchObject({
      version: 3,
      displayGoal: "Put 10 USDG into a bounded Aave position.",
      executionChainIds: [196],
      limits: { maxSolverFeeAtomic: "0" },
    });
    expect(body.policy).not.toHaveProperty("allowedCapabilities");
    expect(state.push).toHaveBeenCalledWith("/intents/550e8400-e29b-41d4-a716-446655440000");
  });

  it("signs an X Layer xStock policy bound to the exact registered contract", async () => {
    const tesla = RWA_INTENT_ASSETS.find(({ symbol }) => symbol === "TSLAx")!;
    const values = {
      templateId: "rwa-acquisition" as const,
      inputToken: INTENT_ASSETS.find(({ symbol }) => symbol === "USDG")!.address,
      outputToken: tesla.address,
      amount: "10",
      minimum: "0.01",
      maxSolverFeeUsd: "0.10",
      jurisdiction: "DE",
      eligibilityAccepted: true,
    };
    const fetchMock = vi.fn().mockImplementation((url: string) => url === "/api/intents/compile"
      ? Promise.resolve(Response.json({ status: "review", values }))
      : url === "/api/intents/readiness"
        ? Promise.resolve(Response.json({ missingNativeBalanceChainIds: [] }))
      : Promise.resolve(Response.json({ links: { intent: "/intents/tesla" } }, { status: 202 })));
    vi.stubGlobal("fetch", fetchMock);
    render(<IntentComposer />);
    fireEvent.change(screen.getByLabelText("What should happen?"), {
      target: { value: "Acquire a bounded Tesla xStock position on X Layer." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review policy" }));
    await screen.findByRole("heading", { name: "Review the policy" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign and publish intent" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Sign and publish intent" }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === "/api/intents")).toBe(true));
    const publishCall = fetchMock.mock.calls.find(([url]) => url === "/api/intents")!;
    const body = JSON.parse(String(publishCall[1].body));
    expect(state.switchToXLayer).toHaveBeenCalled();
    expect(body.policy).toMatchObject({
      executionChainIds: [196],
      inputs: [{ chainId: 196, token: values.inputToken.toLowerCase() }],
      outcomes: [{ kind: "registered-instrument", chainId: 196,
        token: tesla.address.toLowerCase(), minimumIncreaseAtomic: "10000000000000000" }],
    });
    expect(body.policy.outcomes[0].instrumentCommitment).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("signs USDt0 to USDY as a cross-chain bounded intent without legal fields", async () => {
    const usdt0 = INTENT_ASSETS.find(({ symbol }) => symbol === "USDt0")!;
    const usdy = RWA_INTENT_ASSETS.find(({ symbol }) => symbol === "USDY")!;
    const values = {
      templateId: "rwa-acquisition" as const,
      inputToken: usdt0.address,
      outputToken: usdy.address,
      amount: "1",
      minimum: "0.8",
      maxSolverFeeUsd: "0",
      jurisdiction: "",
      eligibilityAccepted: true,
    };
    const fetchMock = vi.fn().mockImplementation((url: string) => url === "/api/intents/compile"
      ? Promise.resolve(Response.json({ status: "review", values }))
      : url === "/api/intents/readiness"
        ? Promise.resolve(Response.json({ missingNativeBalanceChainIds: [] }))
      : Promise.resolve(Response.json({ links: { intent: "/intents/usdy" } }, { status: 202 })));
    vi.stubGlobal("fetch", fetchMock);
    render(<IntentComposer />);
    fireEvent.change(screen.getByLabelText("What should happen?"), {
      target: { value: "turn 1 USDt0 into USDY" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review policy" }));
    await screen.findByRole("heading", { name: "Review the policy" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign and publish intent" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Sign and publish intent" }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === "/api/intents")).toBe(true));
    const publishCall = fetchMock.mock.calls.find(([url]) => url === "/api/intents")!;
    const body = JSON.parse(String(publishCall[1].body));
    expect(state.switchToXLayer).toHaveBeenCalled();
    expect(body.policy).toMatchObject({
      executionChainIds: [1, 196],
      inputs: [{ chainId: 196, token: usdt0.address.toLowerCase(), maximumAtomic: "1000000" }],
      outcomes: [{ kind: "minimum-increase", chainId: 1,
        token: usdy.address.toLowerCase(), atomic: "800000000000000000" }],
    });
    expect(JSON.stringify(body.policy)).not.toContain("jurisdiction");
    expect(JSON.stringify(body.policy)).not.toContain("eligibilityAttested");
  });

  it("shows a missing Ethereum gas balance before requesting an intent signature", async () => {
    const usdy = RWA_INTENT_ASSETS.find(({ symbol }) => symbol === "USDY")!;
    const fetchMock = vi.fn().mockImplementation((url: string) => url === "/api/intents/readiness"
      ? Promise.resolve(Response.json({ missingNativeBalanceChainIds: [1] }))
      : Promise.resolve(Response.json({ balances: [], native: { amountAtomic: "1", formatted: "0.000000001" } })));
    vi.stubGlobal("fetch", fetchMock);
    render(<IntentComposer initialDraft={{
      goal: "All my USDG into at least 0.8 USDY.",
      values: {
        templateId: "rwa-acquisition", inputToken: INTENT_ASSETS[0]!.address,
        outputToken: usdy.address, amount: "1", minimum: "0.8", maxSolverFeeUsd: "0",
        jurisdiction: "", eligibilityAccepted: false,
      },
    }} />);

    expect(await screen.findByText("Add a positive ETH balance on Ethereum before signing.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign and publish intent" })).toBeDisabled();
    expect(state.request).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith("/api/intents/readiness", expect.objectContaining({
      method: "POST", body: JSON.stringify({ owner, executionChainIds: [1, 196] }),
    }));
  });

  it("reviews and signs one staged policy with native OKB and USDt0 inputs", async () => {
    const values = {
      kind: "staged-conversion" as const,
      templateId: "staged-conversion" as const,
      inputs: [
        { kind: "native" as const, chainId: 196 as const,
          token: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as const,
          symbol: "OKB", decimals: 18, amount: "0.005" },
        { kind: "erc20" as const, chainId: 196 as const,
          token: INTENT_ASSETS.find(({ symbol }) => symbol === "USDt0")!.address,
          symbol: "USDt0", decimals: 6, amount: "1" },
      ],
      outputToken: INTENT_ASSETS.find(({ symbol }) => symbol === "USDG")!.address,
      outputSymbol: "USDG", outputDecimals: 6,
      minimum: "1.521679", minimumSource: "market-default" as const,
      maxSolverFeeUsd: "0",
    };
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/assets/resolve") {
        return Promise.resolve(Response.json({ assets: [], unresolved: [] }));
      }
      if (url === "/api/intents/readiness") {
        return Promise.resolve(Response.json({ missingNativeBalanceChainIds: [] }));
      }
      return url === "/api/intents/compile"
        ? Promise.resolve(Response.json({ status: "review", values }))
        : Promise.resolve(Response.json({ links: { intent: "/intents/staged" } }, { status: 202 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<IntentComposer />);
    fireEvent.change(screen.getByLabelText("What should happen?"), {
      target: { value: "Turn 0.005 @OKB and 1 @USDt0 into @USDG" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review policy" }));

    expect(await screen.findByRole("heading", { name: "Review the staged conversion" })).toBeVisible();
    const authority = screen.getByRole("region", { name: "Asset authority" });
    expect(within(authority).getByText("0.005 native OKB + 1 USDt0")).toBeVisible();
    expect(within(authority).getByText("At least 1.521679 USDG")).toBeVisible();
    expect(screen.getByLabelText("Maximum input · OKB")).toHaveValue("0.005");
    expect(screen.getByLabelText("Maximum input · USDt0")).toHaveValue("1");
    expect(screen.getByText("Native OKB")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign and publish intent" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Sign and publish intent" }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === "/api/intents")).toBe(true));
    const publish = fetchMock.mock.calls.find(([url]) => url === "/api/intents")!;
    const body = JSON.parse(String(publish[1].body));
    expect(body.policy).toMatchObject({
      kind: "open-onchain",
      inputs: [
        { token: INTENT_ASSETS.find(({ symbol }) => symbol === "USDt0")!.address.toLowerCase(),
          maximumAtomic: "1000000" },
        { token: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
          maximumAtomic: "5000000000000000" },
      ],
      outcomes: [{ token: INTENT_ASSETS.find(({ symbol }) => symbol === "USDG")!.address.toLowerCase(),
        atomic: "1521679" }],
      limits: { maxNativeValueAtomicByChain: [{ chainId: 196, atomic: "5000000000000000" }] },
    });
    expect(state.request).toHaveBeenCalledWith({
      method: "personal_sign", params: [commitment(body.policy), owner],
    });
  });

  it("reviews and signs exact general-asset chain/address authority", async () => {
    const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
    const compilationLeaseId = "550e8400-e29b-41d4-a716-446655440077";
    const inputToken = "0x2222222222222222222222222222222222222222" as const;
    const outputToken = "0x3333333333333333333333333333333333333333" as const;
    const values = {
      kind: "general-asset-draft" as const, templateId: "general-asset" as const,
      displayGoal: "Swap random assets", sourceChainId: 196 as const,
      destinationChainId: 1 as const, manifestHash: hash("1"),
      evidenceExpiresAtSec: Math.floor(Date.now() / 1_000) + 30,
      input: { token: inputToken, symbol: "IN", decimals: 18, maximumAtomic: "100",
        maximumUsdE8: "50000000000", identityHash: hash("2"), valuationHash: hash("3") },
      output: { token: outputToken, symbol: "OUT", decimals: 6,
        minimumAtomic: "90", identityHash: hash("4") },
      allowedAdapters: [{ id: "lifi.route", version: 1 }],
      limits: { maxStages: 4, maxCallsPerStage: 4, maxApprovals: 8, maxCalldataBytes: 4096,
        maxGasPerStage: "2000000", maxNativeValueUsdE8: "1000000000",
        maxBridgeFeeUsdE8: "5000000000", maxSolverFeeUsdE8: "0",
        maxConversionLossBps: 400, maxSlippageBps: 200 },
    };
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/intents/compile") return Promise.resolve(Response.json({
        status: "review", values, compilationLeaseId,
      }));
      if (url === "/api/intents/readiness") {
        return Promise.resolve(Response.json({ missingNativeBalanceChainIds: [] }));
      }
      if (url === "/api/intents") {
        return Promise.resolve(Response.json({ links: { intent: "/intents/general" } }, { status: 202 }));
      }
      if (url === "/api/assets/resolve") return Promise.resolve(Response.json({ assets: [], unresolved: [] }));
      return Promise.resolve(Response.json({ balances: [], native: {
        symbol: "OKB", amountAtomic: "1", formatted: "0.000000000000000001",
      } }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<IntentComposer />);
    fireEvent.change(screen.getByLabelText("What should happen?"), {
      target: { value: "Swap my exact random token into an Ethereum token" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review policy" }));

    expect(await screen.findByRole("heading", { name: "Review exact asset authority" })).toBeVisible();
    expect(screen.getByText("X Layer → Ethereum")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign and publish intent" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Sign and publish intent" }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === "/api/intents")).toBe(true));
    const publish = fetchMock.mock.calls.find(([url]) => url === "/api/intents")!;
    const body = JSON.parse(String(publish[1].body));
    expect(body.policy).toMatchObject({
      kind: "general-asset", sourceChainId: 196, destinationChainId: 1,
      input: { token: inputToken, maximumAtomic: "100", maximumUsdE8: "50000000000" },
      outputs: [{ chainId: 1, token: outputToken, minimumAtomic: "90" }],
    });
    expect(body.compilationLeaseId).toBe(compilationLeaseId);
    expect(state.switchChain).toHaveBeenCalledWith(196);
    expect(state.switchToXLayer).not.toHaveBeenCalled();
  });
});
