// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocsThemeCookieSync } from "./DocsThemeCookieSync";

vi.mock("fumadocs-ui/provider/base", () => ({
  useTheme: () => ({ theme: "dark" }),
}));

describe("DocsThemeCookieSync", () => {
  beforeEach(() => {
    document.cookie = "cobia-theme=; Path=/; Max-Age=0";
  });

  it("keeps server-rendered pages aligned with the docs theme", async () => {
    render(<DocsThemeCookieSync />);

    await waitFor(() => expect(document.cookie).toContain("cobia-theme=dark"));
  });
});
