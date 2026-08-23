import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CobiaBrand } from "../brand/CobiaBrand";
import { Stage, cobiaColors } from "./Stage";

export const EndCard = () => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const vertical = width < 1200;
  return (
    <Stage>
      <AbsoluteFill style={{ alignItems: "center", display: "flex", justifyContent: "center" }}>
      <Interactive.Div
        name="End card"
        style={{
          alignItems: "center",
          display: "flex",
          flexDirection: "column",
          gap: vertical ? 38 : 28,
          opacity: interpolate(frame, [0, 16], [0, 1], { easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          scale: interpolate(frame, [0, 22], [.92, 1], { easing: Easing.spring({ damping: 200 }), extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }),
          textAlign: "center",
          width: vertical ? 900 : 1500,
        }}
      >
        <CobiaBrand compact />
        <h1 style={{ fontSize: vertical ? 112 : 126, fontWeight: 700, letterSpacing: "-.075em", lineHeight: .9, margin: 0 }}>Describe the outcome.</h1>
        <p style={{ color: cobiaColors.muted, fontSize: vertical ? 52 : 46, lineHeight: 1.2, margin: 0 }}>Keep the keys. Verify before signing.</p>
        <p style={{ background: cobiaColors.ink, color: "white", fontSize: vertical ? 36 : 32, fontWeight: 700, margin: vertical ? "28px 0 0" : "18px 0 0", padding: "18px 28px" }}>getcobia.com</p>
      </Interactive.Div>
      </AbsoluteFill>
    </Stage>
  );
};
