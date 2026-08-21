import { Easing, Img, Interactive, interpolate, staticFile, useCurrentFrame } from "remotion";
import { CobiaBrand } from "../brand/CobiaBrand";
import { Stage } from "../shared/Stage";

export const UiScreenshotScene = () => {
  const frame = useCurrentFrame();
  return (
    <Stage>
      <div style={{ alignItems: "center", display: "flex", inset: "54px 90px", justifyContent: "space-between", position: "absolute" }}>
        <Interactive.Div
          name="UI reveal copy"
          style={{
            opacity: interpolate(frame, [0, 18], [0, 1], { easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            width: 630,
          }}
        >
          <CobiaBrand />
          <p style={{ color: "#3753ff", fontSize: 25, fontWeight: 720, letterSpacing: ".08em", margin: "100px 0 22px", textTransform: "uppercase" }}>New intent experience</p>
          <h1 style={{ fontSize: 104, fontWeight: 660, letterSpacing: "-.07em", lineHeight: .94, margin: 0 }}>Start with what should happen.</h1>
        </Interactive.Div>
        <Interactive.Div
          name="Intent page screenshot"
          style={{
            backgroundColor: "white",
            border: "1px solid #d8dce5",
            borderRadius: 30,
            boxShadow: "0 30px 90px rgba(17,20,26,.17)",
            height: 730,
            opacity: interpolate(frame, [8, 28], [0, 1], { easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            overflow: "hidden",
            scale: interpolate(frame, [8, 34], [.92, 1], { easing: Easing.spring({ damping: 200 }), extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }),
            width: 1050,
          }}
        >
          <Img src={staticFile("ui/cobia-intent-desktop.png")} style={{ height: 730, objectFit: "cover", objectPosition: "top left", width: 1050 }} />
        </Interactive.Div>
      </div>
    </Stage>
  );
};
