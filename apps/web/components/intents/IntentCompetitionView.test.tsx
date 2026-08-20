import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IntentCompetitionView } from "./IntentCompetitionView";

const closesAt = "2033-05-18T03:35:00.000Z";

describe("IntentCompetitionView", () => {
  it("makes a live empty competition read as waiting for submissions", () => {
    const html = renderToStaticMarkup(<IntentCompetitionView
      goal="Supply bounded USDG"
      closesAt={closesAt}
      observedAtSec={2_000_000_000}
      current={[]}
      history={[]}
    />);

    expect(html).not.toContain("Live · accepting proposals");
    expect(html).toContain("Accepting proposals");
    expect(html).toContain("Waiting for solver submissions");
    expect(html).toContain("New solver jobs can still be submitted before the deadline.");
  });

  it("does not describe an elapsed competition as pending", () => {
    const html = renderToStaticMarkup(<IntentCompetitionView
      goal="Supply bounded USDG"
      closesAt="2026-08-20T16:39:37.000Z"
      observedAtSec={2_000_000_000}
      current={[]}
      history={[]}
    />);

    expect(html).toContain("Competition closed");
    expect(html).toContain("Closed without a verified program");
    expect(html).not.toContain("Waiting for solver submissions");
  });
});
