import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/layout/AppHeader", () => ({ AppHeader: () => null }));

import NotFound from "./not-found";

describe("not found", () => {
  it("returns people to the current intent product", () => {
    const html = renderToStaticMarkup(<NotFound />);

    expect(html).toContain("This page is no longer part of Cobia");
    expect(html).toContain('href="/intents/new"');
    expect(html).toContain('href="/discover"');
    expect(html).not.toContain("This page could not be found");
  });
});
