import { Easing, Img, Interactive, interpolate, staticFile, useCurrentFrame } from "remotion";
import { CobiaBrand } from "../brand/CobiaBrand";
import { Stage } from "../shared/Stage";

const tags = ["@USDG", "@USDt0", "@Aave", "@XLayer"] as const;

export const PromptCropScene = () => {
  const frame = useCurrentFrame();
  return (
    <Stage>
      <div style={{ display: "flex", flexDirection: "column", inset: "56px 100px", justifyContent: "space-between", position: "absolute" }}>
        <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
          <CobiaBrand compact />
          <strong style={{ color: "#101936", fontSize: 42, fontWeight: 700, letterSpacing: "-.045em" }}>The intent stays explicit.</strong>
        </div>
        <Interactive.Div
          name="Real intent prompt bar"
          style={{
            backgroundColor: "white",
            border: "1px solid #d8dce5",
            borderRadius: 38,
            boxShadow: "0 30px 90px rgba(17,20,26,.15)",
            opacity: interpolate(frame, [0, 18], [0, 1], { easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            overflow: "hidden",
            padding: 20,
            scale: interpolate(frame, [0, 22], [.95, 1], { easing: Easing.spring({ damping: 200 }), extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }),
          }}
        >
          <Img src={staticFile("ui/cobia-intent-prompt-bar.png")} style={{ borderRadius: 24, display: "block", height: 558, objectFit: "cover", width: 1600 }} />
        </Interactive.Div>
        <div style={{ alignItems: "center", display: "flex", gap: 16 }}>
          <strong style={{ fontSize: 40, marginRight: 12 }}>Parsed as UI objects:</strong>
          {tags.map((tag, index) => (
            <Interactive.Div
              key={tag}
              name={`${tag} tag`}
              style={{
                backgroundColor: "#edf0ff",
                border: "1px solid #ccd3ff",
                borderRadius: 16,
                color: "#3049e8",
                fontSize: 30,
                fontWeight: 720,
                opacity: interpolate(frame, [18 + index * 7, 32 + index * 7], [0, 1], { easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
                padding: "15px 22px",
                scale: interpolate(frame, [18 + index * 7, 36 + index * 7], [.86, 1], { easing: Easing.spring({ damping: 170 }), extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }),
              }}
            >
              {tag}
            </Interactive.Div>
          ))}
        </div>
      </div>
    </Stage>
  );
};
