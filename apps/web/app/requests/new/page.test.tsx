import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/layout/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("@/components/request/PolicyForm", () => ({
  PolicyForm: () => <form aria-label="Intent details" />,
}));

import NewRequestPage from "./page";

describe("NewRequestPage", () => {
  it("prioritizes one intent workspace before supporting product context", () => {
    const html = renderToStaticMarkup(<NewRequestPage />);
    const workspaceIndex = html.indexOf('aria-labelledby="intent-workspace-title"');
    const supportIndex = html.indexOf('aria-labelledby="intent-support-title"');

    expect(workspaceIndex).toBeGreaterThan(-1);
    expect(supportIndex).toBeGreaterThan(workspaceIndex);
    expect(html).toContain('<h1 id="intent-workspace-title">New intent</h1>');
    expect(html).toContain('id="intent-support-title">From intent to verified execution.</h2>');
    expect(html).not.toContain("Describe the outcome you want");
    expect(html).not.toContain("Your best route will appear here");
  });

  it("keeps the interactive workspace width stable across intent content", () => {
    const css = readFileSync(join(process.cwd(), "app/styles/request.css"), "utf8");
    const globalCss = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

    expect(css).toContain("grid-template-columns: minmax(280px, .72fr) minmax(0, 1.48fr)");
    expect(css).toContain("min-height: calc(100svh - 76px); width: 100%");
    expect(css).toContain(".request-page__workspace { align-items: center; display: flex; grid-area: workspace; min-width: 0;");
    expect(css).toContain("inline-size: min(100%, 860px)");
    expect(globalCss).toContain("scrollbar-gutter: stable");
  });
});
