import { ImageResponse } from "next/og";

export const alt = "Cobia — intent-first DeFi routes, verified on X Layer";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{
      alignItems: "stretch",
      background: "#f6faf6",
      color: "#10231d",
      display: "flex",
      flexDirection: "column",
      height: "100%",
      justifyContent: "space-between",
      padding: "72px 82px",
      width: "100%",
    }}>
      <div style={{ display: "flex", fontSize: 26, fontWeight: 800, letterSpacing: 7 }}>
        COBIA <span style={{ color: "#3655ff", marginLeft: 18 }}>· X LAYER</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 930 }}>
        <span style={{ color: "#3655ff", fontSize: 25, fontWeight: 700, marginBottom: 20 }}>
          SOLVERS PROPOSE · COBIA VERIFIES · YOUR WALLET EXECUTES
        </span>
        <span style={{ fontSize: 74, fontWeight: 680, letterSpacing: -4, lineHeight: 1.02 }}>
          Your intent in. The best verified route out.
        </span>
      </div>
      <div style={{ display: "flex", fontSize: 25, justifyContent: "space-between" }}>
        <span>Public route proof · token minimums · bounded execution</span>
        <span style={{ color: "#527166" }}>Intent-first DeFi on X Layer</span>
      </div>
    </div>,
    size,
  );
}
