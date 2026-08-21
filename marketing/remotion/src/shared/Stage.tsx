import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";

export const Stage = ({ children }: { readonly children: React.ReactNode }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: "#f8f9fb", color: "#11141a", overflow: "hidden" }}>
      <Interactive.Div
        name="Cobalt glow"
        style={{
          background: "radial-gradient(circle, rgba(55,83,255,.18) 0%, rgba(55,83,255,0) 68%)",
          borderRadius: "50%",
          height: 900,
          opacity: interpolate(frame, [0, 30], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          position: "absolute",
          right: -230,
          top: -300,
          width: 900,
        }}
      />
      <div style={{ backgroundImage: "radial-gradient(#d8dce6 1px, transparent 1px)", backgroundSize: "28px 28px", inset: 0, opacity: .32, position: "absolute" }} />
      {children}
    </AbsoluteFill>
  );
};

export const ArrowUpIcon = ({ color = "white", size = 28 }: { readonly color?: string; readonly size?: number }) => (
  <svg aria-hidden="true" height={size} viewBox="0 0 24 24" width={size}>
    <path d="M12 19V5M6.5 10.5 12 5l5.5 5.5" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
  </svg>
);
