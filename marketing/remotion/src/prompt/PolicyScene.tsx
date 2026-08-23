import { Easing, Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CobiaBrand } from "../brand/CobiaBrand";
import { Stage } from "../shared/Stage";

const limits = [
  ["Maximum input", "10 USDG"],
  ["Minimum result", "9.95 USDt0"],
  ["Network", "X Layer · 196"],
  ["Authority", "Your wallet"],
] as const;

export const PolicyScene = () => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const vertical = width < 1200;
  return (
    <Stage>
      <div style={{ display: "flex", flexDirection: "column", inset: vertical ? "90px 72px" : "64px 100px", justifyContent: "space-between", position: "absolute" }}>
        <CobiaBrand compact={vertical} />
        <div>
          <h1 style={{ fontSize: vertical ? 112 : 110, fontWeight: 700, letterSpacing: "-.072em", lineHeight: .92, margin: 0 }}>Prose becomes policy.</h1>
        </div>
        <div style={{ display: "grid", gap: vertical ? 22 : 18, gridTemplateColumns: vertical ? "1fr" : "1fr 1fr" }}>
          {limits.map(([label, value], index) => (
            <Interactive.Div
              key={label}
              name={label}
              style={{
                backgroundColor: index === 3 ? "#11141a" : "white",
                border: index === 3 ? "1px solid #11141a" : "1px solid #d8dce5",
                borderRadius: vertical ? 30 : 24,
                color: index === 3 ? "white" : "#11141a",
                opacity: interpolate(frame, [index * 10, index * 10 + 20], [0, 1], { easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
                padding: vertical ? "42px 38px" : "30px 34px",
                translate: interpolate(frame, [index * 10, index * 10 + 22], ["0px 34px", "0px 0px"], { easing: Easing.spring({ damping: 200 }), extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
              }}
            >
              <small style={{ color: index === 3 ? "#aeb8d4" : "#707684", display: "block", fontSize: vertical ? 30 : 24, marginBottom: 12 }}>{label}</small>
              <strong style={{ color: index === 3 ? "white" : "#3049e8", fontSize: vertical ? 58 : 50, fontWeight: 700 }}>{value}</strong>
            </Interactive.Div>
          ))}
        </div>
        <p style={{ color: "#646b78", fontSize: vertical ? 38 : 31, lineHeight: 1.4, margin: 0 }}>The agent proposes. The wallet stays in control.</p>
      </div>
    </Stage>
  );
};
