import { AppHeader } from "@/components/layout/AppHeader";
import { CompetitionView } from "@/components/request/CompetitionView";
import type { Metadata } from "next";

export async function generateMetadata(
  context: PageProps<"/requests/[id]">,
): Promise<Metadata> {
  const { id } = await context.params;
  const shortId = id.slice(0, 8);
  const title = `X Layer solver intent ${shortId}`;
  const description = "Inspect a public solver proof: pinned-block inputs, signed bounds, route authorization, and estimated DeFi outcome on X Layer.";
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { title, description, card: "summary_large_image" },
  };
}

export default async function RequestPage(
  context: PageProps<"/requests/[id]">,
) {
  const { id } = await context.params;
  return (
    <>
      <AppHeader />
      <CompetitionView requestId={id} />
    </>
  );
}
