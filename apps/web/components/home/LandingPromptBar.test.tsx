// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LandingPromptBar } from "./LandingPromptBar";

afterEach(cleanup);

describe("LandingPromptBar", () => {
  it("makes entity tags visible and appends them to the prompt", () => {
    render(<LandingPromptBar />);
    const input = screen.getByRole("textbox", { name: "Describe an onchain goal" });

    fireEvent.change(input, { target: { value: "Swap 10" } });
    fireEvent.click(screen.getByRole("button", { name: "@USDG" }));
    fireEvent.click(screen.getByRole("button", { name: "@XLayer" }));

    expect(input).toHaveValue("Swap 10 @USDG @XLayer ");
    expect(input).toHaveAttribute("name", "goal");
  });
});
