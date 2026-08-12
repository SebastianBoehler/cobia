import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/layout/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("@/components/request/CompetitionView", () => ({ CompetitionView: () => null }));
import { generateMetadata } from "./page";

describe("public intent metadata", () => {
  it("creates a proof-first social card without exposing private route data", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440000" }),
    } as PageProps<"/requests/[id]">);

    expect(metadata.title).toBe("X Layer solver intent 550e8400");
    expect(metadata.description).toContain("public solver proof");
    expect(metadata.openGraph).toMatchObject({
      type: "website",
      url: "/requests/550e8400-e29b-41d4-a716-446655440000",
      images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      creator: "@Cobia_Web3",
      images: ["/opengraph-image"],
    });
  });
});
