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
      <div style={{ alignItems: "center", display: "flex" }}>
        <div style={{ alignItems: "center", background: "#3655ff", borderRadius: 16, display: "flex", height: 58, justifyContent: "center", marginRight: 20, width: 58 }}>
          <svg height="40" viewBox="0 0 34 34" width="40">
            <circle cx="5" cy="17" fill="#fff" r="3.1" />
            <circle cx="29" cy="17" fill="#fff" r="3.1" />
            <path d="M8 17C12 17 11 7 19 7c5.2 0 5.4 7.1 7 8.5M8 17h18M8 17c4 0 3 10 11 10 5.2 0 5.4-7.1 7-8.5" fill="none" stroke="#fff" strokeLinecap="round" strokeWidth="2" />
          </svg>
        </div>
        <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: 7 }}>COBIA</span>
        <span style={{ color: "#3655ff", fontSize: 26, fontWeight: 800, letterSpacing: 4, marginLeft: 18 }}>· X LAYER</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 930 }}>
        <span style={{ fontSize: 74, fontWeight: 680, letterSpacing: -4, lineHeight: 1.02 }}>
          Your intent in. The best verified route out.
        </span>
        <span style={{ color: "#527166", fontSize: 27, lineHeight: 1.35, marginTop: 26 }}>
          Compare bounded DeFi routes. Separate on-chain minimums from forecasts. Execute from your own wallet.
        </span>
      </div>
      <div style={{ display: "flex", fontSize: 25, justifyContent: "space-between" }}>
        <span>Solvers propose · Cobia verifies · your wallet executes</span>
        <span style={{ color: "#3655ff", fontWeight: 700 }}>getcobia.com</span>
      </div>
    </div>,
    size,
  );
}
