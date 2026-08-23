import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig } from "remotion";
import { EndCard } from "../shared/EndCard";
import { CobiaSoundDesign } from "../shared/CobiaSoundDesign";
import { PromptCropScene } from "./PromptCropScene";
import { UiScreenshotScene } from "./UiScreenshotScene";

export const UiRevealTrailer = () => {
  const { fps } = useVideoConfig();
  return (
    <>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={2.8 * fps} name="New intent UI">
        <UiScreenshotScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={linearTiming({ durationInFrames: 12 })} />
      <TransitionSeries.Sequence durationInFrames={2.9 * fps} name="Prompt detail">
        <PromptCropScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 10 })} />
      <TransitionSeries.Sequence durationInFrames={1.8 * fps} name="Cobia end card">
        <EndCard />
      </TransitionSeries.Sequence>
    </TransitionSeries>
    <CobiaSoundDesign cues={[{ file: "orbit.wav", frame: 72 }, { file: "lift.wav", frame: 122 }, { file: "resolve.wav", frame: 168, volume: .7 }]} />
    </>
  );
};
