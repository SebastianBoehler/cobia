import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CobiaBrand } from "../brand/CobiaBrand";

export const EndCard = () => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const vertical = width < 1200;
  return (
    <AbsoluteFill style={{ alignItems: "center", backgroundColor: "#10131a", color: "white", display: "flex", justifyContent: "center" }}>
      <div style={{ background: "radial-gradient(circle, rgba(55,83,255,.55), transparent 64%)", height: vertical ? 900 : 1100, position: "absolute", width: vertical ? 900 : 1100 }} />
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
        <div style={{ background: "white", borderRadius: 999, padding: vertical ? "18px 26px" : "14px 22px" }}><CobiaBrand compact /></div>
        <h1 style={{ fontSize: vertical ? 104 : 108, fontWeight: 660, letterSpacing: "-.065em", lineHeight: .96, margin: 0 }}>Describe the outcome.</h1>
        <p style={{ color: "#b8c0d4", fontSize: vertical ? 50 : 44, lineHeight: 1.25, margin: 0 }}>Keep the keys. Verify before signing.</p>
        <p style={{ color: "#8ea0ff", fontSize: vertical ? 34 : 30, fontWeight: 680, letterSpacing: ".02em", margin: vertical ? "30px 0 0" : "18px 0 0" }}>getcobia.com</p>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
