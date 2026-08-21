import { JudgeEvidence } from "../../components/buildx/JudgeEvidence";
import { AppHeader } from "../../components/layout/AppHeader";
import { createPageMetadata } from "../site-metadata";

export const metadata = createPageMetadata({
  title: "BuildX AI Season evidence",
  description: "Inspect Cobia's X Layer deployments, verifier boundary, public implementation and measurable roadmap.",
  path: "/buildx",
});

export default function BuildXEvidencePage() {
  return <><AppHeader /><JudgeEvidence /></>;
}
