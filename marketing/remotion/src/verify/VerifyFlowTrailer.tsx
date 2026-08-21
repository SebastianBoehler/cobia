import { Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { CobiaBrand } from "../brand/CobiaBrand";
import { Stage } from "../shared/Stage";

const steps = [
  ["01", "Signed goal", "Outcome + hard limits"],
  ["02", "Solver proposal", "Unsigned program"],
  ["03", "Independent replay", "Targets + calldata + balances"],
  ["04", "Wallet review", "Exact calls only"],
] as const;

export const VerifyFlowTrailer = () => {
  const frame = useCurrentFrame();
  return (
    <Stage>
      <div style={{ display: "flex", flexDirection: "column", inset: "68px", justifyContent: "space-between", position: "absolute" }}>
        <CobiaBrand compact />
        <div>
          <p style={{ color: "#3753ff", fontSize: 24, fontWeight: 720, letterSpacing: ".08em", margin: "0 0 18px", textTransform: "uppercase" }}>Open generation. Verified authorization.</p>
          <h1 style={{ fontSize: 86, fontWeight: 660, letterSpacing: "-.065em", lineHeight: .96, margin: 0 }}>AI proposes.<br />You approve.</h1>
        </div>
        <div style={{ display: "grid", gap: 14 }}>
          {steps.map(([number, title, detail], index) => (
            <Interactive.Div
              key={number}
              name={title}
              style={{
                alignItems: "center",
                backgroundColor: index === 3 ? "#11141a" : "white",
                border: index === 3 ? "1px solid #11141a" : "1px solid #d8dce5",
                borderRadius: 22,
                color: index === 3 ? "white" : "#11141a",
                display: "grid",
                gap: 18,
                gridTemplateColumns: "64px 1fr",
                opacity: interpolate(frame, [18 + index * 22, 36 + index * 22], [0, 1], { easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
                padding: "24px 26px",
                translate: interpolate(frame, [18 + index * 22, 40 + index * 22], ["34px 0px", "0px 0px"], { easing: Easing.spring({ damping: 200 }), extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
              }}
            >
              <span style={{ color: index === 3 ? "#8ea0ff" : "#3753ff", fontFamily: "monospace", fontSize: 21 }}>{number}</span>
              <div><strong style={{ display: "block", fontSize: 33, marginBottom: 5 }}>{title}</strong><small style={{ color: index === 3 ? "#b8c0d4" : "#69707d", fontSize: 21 }}>{detail}</small></div>
            </Interactive.Div>
          ))}
        </div>
        <Interactive.Div
          name="Closing proof line"
          style={{
            color: "#3049e8",
            fontSize: 30,
            fontWeight: 720,
            opacity: interpolate(frame, [118, 140], [0, 1], { easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            textAlign: "center",
          }}
        >
          State the outcome. Keep the keys.
        </Interactive.Div>
      </div>
    </Stage>
  );
};
