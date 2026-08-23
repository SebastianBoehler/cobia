import { Highlight } from "@remotion/rough-notation";
import { Easing, Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CobiaBrand } from "../brand/CobiaBrand";
import { ArrowUpIcon, Stage } from "../shared/Stage";

const goal = "Swap 10 @USDG into at least 9.95 @USDt0 on @XLayer";

const TaggedText = ({ text }: { readonly text: string }) => {
  const frame = useCurrentFrame();
  return text.split(/(@[A-Za-z0-9]+)/g).map((part, index) => part.startsWith("@") ? (
    <Highlight
      color="rgba(55,83,255,.15)"
      key={`${part}-${index}`}
      progress={interpolate(frame, [54 + index * 2, 68 + index * 2], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
    >
      <strong style={{ color: "#3049e8", fontWeight: 700 }}>{part}</strong>
    </Highlight>
  ) : part);
};

const Example = ({ children, delay }: { readonly children: React.ReactNode; readonly delay: number }) => {
  const frame = useCurrentFrame();
  return (
    <Interactive.Div
      name="Example intent"
      style={{
        backgroundColor: "#f1f3f7",
        borderRadius: 18,
        color: "#626875",
        fontSize: 22,
        lineHeight: 1.35,
        opacity: interpolate(frame, [delay, delay + 14, 54, 68], [0, 1, 1, .18], { easing: [Easing.bezier(0.16, 1, 0.3, 1), Easing.linear, Easing.bezier(0.16, 1, 0.3, 1)], extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        padding: "22px 24px",
        scale: interpolate(frame, [delay, delay + 16], [.96, 1], { easing: Easing.spring({ damping: 200 }), extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }),
      }}
    >
      {children}
    </Interactive.Div>
  );
};

export const PromptInputScene = () => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const vertical = width < 1200;
  const count = Math.floor(interpolate(frame, [48, 122], [0, goal.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return (
    <Stage>
      <div style={{ display: "flex", flexDirection: "column", inset: vertical ? "90px 72px" : "64px 100px", justifyContent: "space-between", position: "absolute" }}>
        <CobiaBrand compact={vertical} />
        <Interactive.Div
          name="Prompt heading"
          style={{
            opacity: interpolate(frame, [0, 18], [0, 1], { easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            translate: interpolate(frame, [0, 18], ["0px 26px", "0px 0px"], { easing: Easing.spring({ damping: 200 }), extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          <h1 style={{ fontSize: vertical ? 112 : 106, fontWeight: 700, letterSpacing: "-.072em", lineHeight: .92, margin: 0 }}>Describe the outcome.</h1>
        </Interactive.Div>

        <Interactive.Div
          name="Intent prompt bar"
          style={{
            backgroundColor: "white",
            border: "1px solid #d8dce5",
            borderRadius: vertical ? 38 : 34,
            boxShadow: "0 28px 80px rgba(17,20,26,.14)",
            minHeight: vertical ? 620 : 470,
            opacity: interpolate(frame, [10, 30], [0, 1], { easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            padding: vertical ? "52px 44px 34px" : "38px 42px 30px",
            scale: interpolate(frame, [10, 34], [.94, 1], { easing: Easing.spring({ damping: 200 }), extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }),
          }}
        >
          <div style={{ color: count ? "#11141a" : "#69707d", fontSize: vertical ? 58 : 48, fontWeight: count ? 570 : 430, lineHeight: 1.3, minHeight: vertical ? 220 : 150 }}>
            {count ? <TaggedText text={goal.slice(0, count)} /> : "Ask Cobia to do something onchain…"}
            {frame >= 48 && frame < 130 ? <span style={{ color: "#3753ff", opacity: frame % 16 < 8 ? 1 : 0 }}>|</span> : null}
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: vertical ? "1fr" : "1fr 1fr 1fr", marginTop: 16 }}>
            <Example delay={18}>Swap 10 <strong style={{ color: "#3753ff" }}>@USDG</strong> into at least 9.95 <strong style={{ color: "#3753ff" }}>@USDt0</strong></Example>
            <Example delay={22}>Supply <strong style={{ color: "#3753ff" }}>@USDG</strong> to <strong style={{ color: "#3753ff" }}>@Aave</strong></Example>
            {!vertical ? <Example delay={26}>Review a route on <strong style={{ color: "#3753ff" }}>@XLayer</strong> before signing</Example> : null}
          </div>

          <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginTop: vertical ? 30 : 22 }}>
            <div style={{ display: "flex", gap: 12 }}>
              {["Any action", "@ Mention", "Routes"].map((item) => <span key={item} style={{ background: "#f1f3f7", borderRadius: 999, color: "#20242d", fontSize: vertical ? 25 : 19, padding: vertical ? "15px 23px" : "12px 19px" }}>{item}</span>)}
            </div>
            <Interactive.Div
              name="Review button"
              style={{
                alignItems: "center",
                backgroundColor: frame > 120 ? "#11141a" : "#b4b7bd",
                borderRadius: "50%",
                display: "flex",
                height: vertical ? 78 : 62,
                justifyContent: "center",
                scale: interpolate(frame, [118, 128, 140], [1, 1.12, 1], { easing: [Easing.spring({ damping: 140 }), Easing.spring({ damping: 200 })], extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }),
                width: vertical ? 78 : 62,
              }}
            >
              <ArrowUpIcon size={vertical ? 38 : 30} />
            </Interactive.Div>
          </div>
        </Interactive.Div>
      </div>
    </Stage>
  );
};
