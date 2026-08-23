import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CobiaBrand } from "../brand/CobiaBrand";
import { CobiaSoundDesign } from "../shared/CobiaSoundDesign";
import { ArrowUpIcon, Stage } from "../shared/Stage";

const intent = "Swap 10 @USDG into at least 9.95 @USDt0 on @XLayer";

const IntentText = ({ text }: { readonly text: string }) => (
  <>
    {text.split(/(@[A-Za-z0-9]+)/g).map((part, index) => part.startsWith("@") ? (
      <span
        key={`${part}-${index}`}
        style={{
          backgroundColor: "rgba(55, 83, 255, 0.12)",
          borderRadius: 12,
          boxDecorationBreak: "clone",
          color: "#3049e8",
          fontWeight: 700,
          padding: "2px 7px 4px",
          WebkitBoxDecorationBreak: "clone",
        }}
      >
        {part}
      </span>
    ) : part)}
  </>
);

const CheckIcon = () => (
  <svg aria-hidden="true" height="34" viewBox="0 0 24 24" width="34">
    <path d="m5.5 12.5 4 4 9-9" fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
  </svg>
);

export const CleanPromptClip = () => {
  const frame = useCurrentFrame();
  const { height, width } = useVideoConfig();
  const socialLandscape = height / width > 0.5;
  const banner = height / width < .45;
  const count = Math.floor(interpolate(frame, [24, 126], [0, intent.length], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }));
  const sent = frame >= 166;

  return (
    <Stage>
    <AbsoluteFill style={{ color: "#11141a", overflow: "hidden", padding: socialLandscape ? 52 : 28 }}>
      <header style={{ left: socialLandscape ? 84 : 34, position: "absolute", top: socialLandscape ? 38 : 18, zIndex: 3 }}><CobiaBrand compact /></header>
      <Interactive.Div
        name="Intent prompt field"
        style={{
          backgroundColor: "white",
          border: "1px solid #d8dce5",
          borderRadius: 34,
          boxShadow: "0 22px 60px rgba(17, 20, 26, 0.12)",
          display: "flex",
          flexDirection: "column",
          inset: socialLandscape ? "118px 52px 52px" : banner ? "76px 28px 28px" : 28,
          justifyContent: "space-between",
          opacity: interpolate(frame, [0, 12, 204, 218], [0, 1, 1, 0], {
            easing: [Easing.bezier(0.16, 1, 0.3, 1), Easing.linear, Easing.bezier(0.7, 0, 0.84, 0)],
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          padding: socialLandscape ? "72px 76px 58px" : "46px 48px 38px",
          position: "absolute",
          scale: interpolate(frame, [0, 14], [0.985, 1], {
            easing: Easing.spring({ damping: 200 }),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            output: "perceptual-scale",
          }),
        }}
      >
        <Interactive.Div
          name="Animated intent"
          style={{
            fontSize: socialLandscape ? 82 : 62,
            fontWeight: count ? 560 : 430,
            letterSpacing: "-0.025em",
            lineHeight: 1.3,
            minHeight: socialLandscape ? 540 : 210,
            opacity: interpolate(frame, [150, 166, 180], [1, 0.72, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: interpolate(frame, [150, 166, 180], ["0px 0px", "0px -5px", "0px 0px"], {
              easing: Easing.spring({ damping: 200 }),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          {count ? <IntentText text={intent.slice(0, count)} /> : (
            <span style={{ color: "#69707d" }}>Ask Cobia to do something onchain…</span>
          )}
          {frame >= 20 && frame < 146 ? (
            <span style={{ color: "#3753ff", opacity: frame % 16 < 8 ? 1 : 0 }}>│</span>
          ) : null}
        </Interactive.Div>

        <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 12 }}>
            {["Any action", "@ Mention", "Routes"].map((item) => (
              <span key={item} style={{ background: "#f1f3f7", borderRadius: 999, color: "#20242d", fontSize: socialLandscape ? 30 : 24, padding: socialLandscape ? "17px 28px" : "13px 22px" }}>
                {item}
              </span>
            ))}
          </div>

          <Interactive.Div
            name="Send intent"
            style={{
              alignItems: "center",
              backgroundColor: sent ? "#3753ff" : frame >= 126 ? "#11141a" : "#b4b7bd",
              borderRadius: "50%",
              boxShadow: sent ? "0 0 0 14px rgba(55, 83, 255, 0.12)" : "0 0 0 0 rgba(55, 83, 255, 0)",
              display: "flex",
              height: socialLandscape ? 92 : 76,
              justifyContent: "center",
              overflow: "hidden",
              scale: interpolate(frame, [146, 156, 166, 178], [1, 1.08, 0.86, 1], {
                easing: [Easing.spring({ damping: 180 }), Easing.spring({ damping: 180 }), Easing.spring({ damping: 140 })],
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                output: "perceptual-scale",
              }),
              width: socialLandscape ? 92 : 76,
            }}
          >
            <div style={{ opacity: interpolate(frame, [154, 166], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), translate: interpolate(frame, [154, 166], ["0px 0px", "0px -38px"], { easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
              <ArrowUpIcon size={36} />
            </div>
            <div style={{ opacity: interpolate(frame, [164, 174], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), position: "absolute", scale: interpolate(frame, [164, 178], [0.7, 1], { easing: Easing.spring({ damping: 160 }), extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }) }}>
              <CheckIcon />
            </div>
          </Interactive.Div>
        </div>
      </Interactive.Div>
      <CobiaSoundDesign cues={[{ file: "orbit.wav", frame: 70 }, { file: "lift.wav", frame: 126 }, { file: "resolve.wav", frame: 164, volume: .66 }]} />
    </AbsoluteFill>
    </Stage>
  );
};
