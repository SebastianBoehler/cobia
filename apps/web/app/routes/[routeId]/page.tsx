import { AppHeader } from "@/components/layout/AppHeader";
import { RouteAccessView } from "@/components/routes/RouteAccessView";

export default async function PurchasedRoutePage(context: PageProps<"/routes/[routeId]">) {
  const { routeId } = await context.params;
  return (
    <>
      <AppHeader />
      <RouteAccessView routeId={routeId} />
    </>
  );
}
