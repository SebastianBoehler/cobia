import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/layout/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("@/components/intents/IntentComposer", () => ({ IntentComposer: () => <div>Intent composer</div> }));

import NewIntentPage from "./page";

describe("new intent page", () => {
  it("frames the composer as a general onchain request", () => {
    const html = renderToStaticMarkup(<NewIntentPage />);
    expect(html).toContain("Describe the outcome");
    expect(html).toContain("Intent composer");
    expect(html).not.toMatch(/Earn|Swap|Profit/);
  });
});
