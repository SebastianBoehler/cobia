import { Audio } from "@remotion/media";
import { Sequence, staticFile, useVideoConfig } from "remotion";

type Cue = {
  readonly file: "lift.wav" | "orbit.wav" | "resolve.wav" | "slide.wav";
  readonly frame: number;
  readonly volume?: number;
};

export const CobiaSoundDesign = ({ cues = [] }: { readonly cues?: readonly Cue[] }) => {
  const { durationInFrames } = useVideoConfig();
  return <>
    <Audio
      loop
      src={staticFile("sfx/solver-air/bed.wav")}
      volume={(frame: number) => Math.min(.66, frame / 22 * .66, (durationInFrames - frame) / 26 * .66)}
    />
    {cues.map(({ file, frame, volume = .56 }) => (
      <Sequence from={frame} key={`${file}-${frame}`} layout="none">
        <Audio src={staticFile(`sfx/solver-air/${file}`)} volume={volume} />
      </Sequence>
    ))}
  </>;
};
