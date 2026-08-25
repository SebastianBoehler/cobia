import { JudgeEvidence } from "../../components/buildx/JudgeEvidence";
import { AppHeader } from "../../components/layout/AppHeader";
import { createPageMetadata } from "../site-metadata";

export const metadata = createPageMetadata({
  title: "Cobia for X Layer AI Season",
  description: "See confirmed TSLAx acquisition, V4 swaps, multi-step programs, and public proof of Cobia's independently verified X Layer execution.",
  path: "/buildx",
});

export default function BuildXEvidencePage() {
  return <><AppHeader /><JudgeEvidence /></>;
}
