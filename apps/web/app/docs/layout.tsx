import type { ReactNode } from "react";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/next";
import { DocsThemeCookieSync } from "../../components/docs/DocsThemeCookieSync";
import { docsSource } from "../../lib/docs/source";

export default function DeveloperDocsLayout({ children }: { children: ReactNode }) {
  return <RootProvider
    search={{ enabled: false }}
    theme={{ attribute: ["class", "data-theme"], storageKey: "cobia-theme" }}
  >
    <DocsThemeCookieSync />
    <DocsLayout
      tree={docsSource.getPageTree()}
      nav={{ title: "COBIA / DOCS", url: "/docs" }}
      links={[
        { text: "App", url: "/", active: "none" },
        { text: "Solvers", url: "/solvers", active: "none" },
      ]}
      sidebar={{ prefetch: false }}
    >{children}</DocsLayout>
  </RootProvider>;
}
