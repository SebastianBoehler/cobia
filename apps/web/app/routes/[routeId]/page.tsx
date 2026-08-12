import { AppHeader } from "@/components/layout/AppHeader";
import { RouteAccessView } from "@/components/routes/RouteAccessView";
import { createPageMetadata } from "../../site-metadata";
import type { Metadata } from "next";

export async function generateMetadata(
  context: PageProps<"/routes/[routeId]">,
): Promise<Metadata> {
  const { routeId } = await context.params;
  return createPageMetadata({
    title: "Purchased Route",
    description: "Private purchased route details, verification evidence, simulation output, and wallet-confirmed execution state.",
    path: `/routes/${routeId}`,
    index: false,
  });
}

export default async function PurchasedRoutePage(context: PageProps<"/routes/[routeId]">) {
  const { routeId } = await context.params;
  return (
    <>
      <AppHeader />
      <RouteAccessView routeId={routeId} />
    </>
  );
}
