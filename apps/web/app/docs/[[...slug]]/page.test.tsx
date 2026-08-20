import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import DocsPageRoute from "./page";

vi.mock("fumadocs-ui/layouts/docs/page", async () => {
  const { createElement } = await import("react");
  const wrapper = (tag: string) => ({ children }: { children?: React.ReactNode }) =>
    createElement(tag, null, children);
  return {
    DocsBody: wrapper("main"),
    DocsDescription: wrapper("p"),
    DocsPage: wrapper("article"),
    DocsTitle: wrapper("h1"),
  };
});

describe("developer documentation routes", () => {
  it("renders the public solver quickstart at /docs", async () => {
    const page = await DocsPageRoute({
      params: Promise.resolve({ slug: undefined }),
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Build a solver");
    expect(html).toContain("Cobia never asks for signing secrets");
    expect(html).toContain("API availability");
    expect(html).toContain("Verifier-owned evidence");
  });
});
