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
});
