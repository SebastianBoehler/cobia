import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import DeveloperDocsLayout from "./layout";

vi.mock("fumadocs-ui/provider/next", () => ({
  RootProvider: ({
    children,
    theme,
  }: {
    children: React.ReactNode;
    theme?: { attribute?: string | string[]; storageKey?: string };
  }) => <div
    data-theme-attribute={Array.isArray(theme?.attribute) ? theme.attribute.join(",") : theme?.attribute}
    data-theme-storage={theme?.storageKey}
  >{children}</div>,
}));

vi.mock("fumadocs-ui/provider/base", () => ({
  useTheme: () => ({ theme: "system" }),
}));

vi.mock("fumadocs-ui/layouts/docs", () => ({
  DocsLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

describe("DeveloperDocsLayout", () => {
  it("shares Cobia's stored theme with Fumadocs", () => {
    const html = renderToStaticMarkup(<DeveloperDocsLayout><p>Docs</p></DeveloperDocsLayout>);

    expect(html).toContain('data-theme-attribute="class,data-theme"');
    expect(html).toContain('data-theme-storage="cobia-theme"');
  });
});
