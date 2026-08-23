import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig } from "remotion";
import { EndCard } from "../shared/EndCard";
import { CobiaSoundDesign } from "../shared/CobiaSoundDesign";
import { PolicyScene } from "./PolicyScene";
import { PromptInputScene } from "./PromptInputScene";

export const PromptTrailer = () => {
  const { fps } = useVideoConfig();
  return (
    <>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={5 * fps} name="Intent prompt">
        <PromptInputScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: 12 })} />
      <TransitionSeries.Sequence durationInFrames={2.6 * fps} name="Typed policy">
        <PolicyScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 10 })} />
      <TransitionSeries.Sequence durationInFrames={2 * fps} name="Cobia end card">
        <EndCard />
      </TransitionSeries.Sequence>
    </TransitionSeries>
    <CobiaSoundDesign cues={[{ file: "slide.wav", frame: 138 }, { file: "lift.wav", frame: 195 }, { file: "resolve.wav", frame: 234, volume: .7 }]} />
    </>
  );
};
