import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/layout/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("@/components/brand/RouteCanvas", () => ({ RouteCanvas: () => null }));

import Home from "./page";

describe("home conversion path", () => {
  it("starts the intent flow before offering route discovery", () => {
    const html = renderToStaticMarkup(<Home />);
    const createIndex = html.indexOf("Create an intent");
    const exploreIndex = html.indexOf("Explore verified routes");

    expect(createIndex).toBeGreaterThan(-1);
    expect(exploreIndex).toBeGreaterThan(createIndex);
    expect(html).toContain('href="/requests/new"');
    expect(html).toContain("Execute");
    expect(html).toContain("wallet confirms every transaction");
  });
});
