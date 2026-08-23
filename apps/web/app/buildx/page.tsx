import { JudgeEvidence } from "../../components/buildx/JudgeEvidence";
import { AppHeader } from "../../components/layout/AppHeader";
import { createPageMetadata } from "../site-metadata";

export const metadata = createPageMetadata({
  title: "Cobia for X Layer AI Season",
  description: "See how Cobia independently verifies AI-authored transaction plans before owner approval on X Layer.",
  path: "/buildx",
});

export default function BuildXEvidencePage() {
  return <><AppHeader /><JudgeEvidence /></>;
}
