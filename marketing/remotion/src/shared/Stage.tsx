import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export const cobiaColors = {
  cobalt: "#3753ff",
  cobaltDark: "#3049e8",
  cobaltWash: "#edf0ff",
  ink: "#101936",
  line: "#d7dce8",
  muted: "#626b7a",
  paper: "#f7f8fc",
  surface: "#ffffff",
} as const;

export const Stage = ({ children }: { readonly children: React.ReactNode }) => {
  const frame = useCurrentFrame();
  const { height, width } = useVideoConfig();
  const vertical = height / width > 1.25;
  return (
    <AbsoluteFill style={{ backgroundColor: cobiaColors.paper, color: cobiaColors.ink, fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif", overflow: "hidden" }}>
      <Interactive.Div
        name="Cobalt glow"
        style={{
          background: "radial-gradient(circle, rgba(55,83,255,.18) 0%, rgba(55,83,255,0) 68%)",
          borderRadius: "50%",
          height: vertical ? 1200 : 980,
          opacity: interpolate(frame, [0, 30], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          position: "absolute",
          right: vertical ? -500 : -280,
          top: vertical ? -320 : -430,
          width: vertical ? 1200 : 980,
        }}
      />
      <div style={{ backgroundImage: "linear-gradient(rgba(55,83,255,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(55,83,255,.055) 1px, transparent 1px)", backgroundSize: vertical ? "60px 60px" : "72px 72px", inset: 0, position: "absolute" }} />
      {children}
    </AbsoluteFill>
  );
};

export const ArrowUpIcon = ({ color = "white", size = 28 }: { readonly color?: string; readonly size?: number }) => (
  <svg aria-hidden="true" height={size} viewBox="0 0 24 24" width={size}>
    <path d="M12 19V5M6.5 10.5 12 5l5.5 5.5" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
  </svg>
);
