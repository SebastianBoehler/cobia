import { AppHeader } from "@/components/layout/AppHeader";
import { CompetitionView } from "@/components/request/CompetitionView";

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
