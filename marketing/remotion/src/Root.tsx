import { Composition, Folder } from "remotion";
import "./index.css";
import { BouncyPromptClip } from "./prompt/BouncyPromptClip";
import { CleanPromptClip } from "./prompt/CleanPromptClip";
import { TagPickerClip } from "./prompt/TagPickerClip";
import { PromptTrailer } from "./prompt/PromptTrailer";
import { UiRevealTrailer } from "./reveal/UiRevealTrailer";
import { VerifyFlowTrailer } from "./verify/VerifyFlowTrailer";
import { TokenEvidenceClip } from "./evidence/TokenEvidenceClip";
import { LandedProgramProofCut } from "./proof-cut/LandedProgramProofCut";
import { AnalyticsLaunchTrailer } from "./launch/AnalyticsLaunchTrailer";

export const RemotionRoot = () => (
  <>
    <Folder name="Cobia-Promos">
      <Composition id="Cobia-Landed-Program-Proof-X" component={LandedProgramProofCut} durationInFrames={570} fps={30} width={1920} height={1080} />
      <Composition id="Cobia-Launch-Analytics-X" component={AnalyticsLaunchTrailer} durationInFrames={720} fps={30} width={1920} height={1080} />
      <Composition id="Cobia-Token-Evidence-X" component={TokenEvidenceClip} durationInFrames={360} fps={30} width={1920} height={1080} />
      <Composition id="Cobia-Tag-Picker-X" component={TagPickerClip} durationInFrames={270} fps={30} width={1920} height={1080} />
      <Composition id="Cobia-Bouncy-Prompt-X" component={BouncyPromptClip} durationInFrames={230} fps={30} width={1920} height={1080} />
      <Composition id="Cobia-Clean-Prompt" component={CleanPromptClip} durationInFrames={220} fps={30} width={1600} height={560} />
      <Composition id="Cobia-Clean-Prompt-X" component={CleanPromptClip} durationInFrames={220} fps={30} width={1920} height={1080} />
      <Composition id="Cobia-Prompt-Tags-16x9" component={PromptTrailer} durationInFrames={266} fps={30} width={1920} height={1080} />
      <Composition id="Cobia-Prompt-Tags-9x16" component={PromptTrailer} durationInFrames={266} fps={30} width={1080} height={1920} />
      <Composition id="Cobia-Intent-UI-Reveal" component={UiRevealTrailer} durationInFrames={203} fps={30} width={1920} height={1080} />
      <Composition id="Cobia-Verify-Flow-Square" component={VerifyFlowTrailer} durationInFrames={210} fps={30} width={1080} height={1080} />
    </Folder>
  </>
);
