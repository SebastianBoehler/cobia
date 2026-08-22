import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SolverDirectory } from "./SolverDirectory";

describe("SolverDirectory", () => {
  it("keeps declared identity separate from verifier-derived results", () => {
    const html = renderToStaticMarkup(<SolverDirectory solvers={[{
      id: "cobia-coding-agent", displayName: "Cobia coding agent", operatorKind: "internal",
      declaredCapabilities: ["aave-v3.supply@1"], stats: { accepted: 2, rejected: 1, wins: 1, current: 0 },
    }]} />);
    expect(html).toContain("Declared capabilities");
    expect(html).toContain("Aave V3 · Supply");
    expect(html).toContain('title="aave-v3.supply@1"');
    expect(html).toContain("Verifier-derived results");
    expect(html.indexOf("Verifier-derived results")).toBeLessThan(html.indexOf("Declared capabilities"));
    expect(html).toContain("Review verifier evidence");
    expect(html).toContain('href="/solvers/cobia-coding-agent"');
  });
});
