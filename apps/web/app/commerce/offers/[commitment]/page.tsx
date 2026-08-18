import { notFound } from "next/navigation";
import { CommerceOfferDetails } from "@/components/commerce/CommerceOfferDetails";
import { AppHeader } from "@/components/layout/AppHeader";
import { getCommerceOfferRepository } from "@/lib/runtime/market";
import { currentUnixSeconds } from "@/lib/time";
import { createPageMetadata } from "../../../site-metadata";

export const dynamic = "force-dynamic";
export const metadata = createPageMetadata({
  title: "Commerce offer",
  description: "Review an immutable x402 or UCP offer and its verification boundary.",
  path: "/commerce/offers",
});

export default async function CommerceOfferPage({ params }: PageProps<"/commerce/offers/[commitment]">) {
  const { commitment } = await params;
  const offer = await getCommerceOfferRepository().get(commitment).catch(() => null);
  if (!offer) notFound();
  return <>
    <AppHeader />
    <main className="directory-page" id="main-content">
      <CommerceOfferDetails offer={offer} observedAtSec={currentUnixSeconds()} />
    </main>
  </>;
}
