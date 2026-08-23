import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { CobiaBrand } from "../brand/CobiaBrand";
import { colors, geistSans } from "./theme";

export const ProofStage = ({ children, dark = false }: {
  readonly children: React.ReactNode;
  readonly dark?: boolean;
}) => {
  const frame = useCurrentFrame();
  const foreground = dark ? colors.paper : colors.ink;
  const grid = dark ? "rgba(248,249,251,.075)" : "rgba(105,112,125,.14)";

  return (
    <AbsoluteFill style={{ backgroundColor: dark ? colors.dark : colors.paper, color: foreground, fontFamily: geistSans, letterSpacing: ".008em", overflow: "hidden" }}>
      <div style={{ backgroundImage: `linear-gradient(${grid} 1px, transparent 1px), linear-gradient(90deg, ${grid} 1px, transparent 1px)`, backgroundSize: "72px 72px", inset: 0, opacity: .34, position: "absolute" }} />
      <Interactive.Div name="Cobalt route glow" style={{
        background: "radial-gradient(circle, rgba(55,83,255,.24), transparent 68%)",
        height: 1040,
        opacity: interpolate(frame, [0, 26], [0, 1], { easing: Easing.bezier(.16, 1, .3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        position: "absolute",
        right: -330,
        top: -500,
        width: 1040,
      }} />
      <header style={{ left: 96, position: "absolute", top: 72, zIndex: 4 }}>
        <div style={{ background: dark ? colors.paper : "transparent", borderRadius: 999, padding: dark ? "10px 16px" : 0 }}>
          <CobiaBrand compact />
        </div>
      </header>
      {children}
    </AbsoluteFill>
  );
};

export const CheckIcon = ({ color = "currentColor", size = 24 }: { readonly color?: string; readonly size?: number }) => (
  <svg aria-hidden="true" height={size} viewBox="0 0 24 24" width={size}>
    <path d="m5.5 12.5 4 4 9-9" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3" />
  </svg>
);

export const ArrowIcon = ({ color = "currentColor", size = 24 }: { readonly color?: string; readonly size?: number }) => (
  <svg aria-hidden="true" height={size} viewBox="0 0 24 24" width={size}>
    <path d="M5 12h14m-5.5-5.5L19 12l-5.5 5.5" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
  </svg>
);
