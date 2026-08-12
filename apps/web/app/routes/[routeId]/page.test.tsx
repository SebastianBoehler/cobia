import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/layout/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("@/components/routes/RouteAccessView", () => ({ RouteAccessView: () => null }));

import { generateMetadata } from "./page";

describe("purchased route metadata", () => {
  it("uses the exact route URL while keeping private bundles out of search", async () => {
    const routeId = "0x566a051e0bc9173b53f735adec8d11e29ad829a15646822cc89d9b8ef8b94052";
    const metadata = await generateMetadata({
      params: Promise.resolve({ routeId }),
    } as PageProps<"/routes/[routeId]">);
    expect(metadata.alternates).toEqual({ canonical: `/routes/${routeId}` });
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
