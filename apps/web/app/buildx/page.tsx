import { JudgeEvidence } from "../../components/buildx/JudgeEvidence";
import { AppHeader } from "../../components/layout/AppHeader";
import { createPageMetadata } from "../site-metadata";

export const metadata = createPageMetadata({
  title: "Cobia for X Layer AI Season",
  description: "Explore Cobia's verified programs, X Layer deployments, protocol support and public roadmap.",
  path: "/buildx",
});

export default function BuildXEvidencePage() {
  return <><AppHeader /><JudgeEvidence /></>;
}
