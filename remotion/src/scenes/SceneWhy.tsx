import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { C } from "../theme";
import { display, body } from "../fonts";
import { Robot } from "../components/Robot";

const RULES = [
  ["Volume surge", "3.4× 30d avg", true],
  ["Trend slope", "+0.82 (need 0.60)", true],
  ["Drawdown risk", "within limits", true],
  ["Near-miss margin", "12% slack left", false],
] as const;

/** Explainability beat: every signal shows its receipts. */
export const SceneWhy: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({ frame, fps, config: { damping: 18 } });

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          top: 200,
          width: "100%",
          textAlign: "center",
          fontFamily: display,
          fontSize: 100,
          color: C.text,
          letterSpacing: -3,
          textTransform: "uppercase",
          opacity: t,
          transform: `translateY(${interpolate(t, [0, 1], [40, 0])}px)`,
        }}
      >
        No black box.
        <br />
        <span style={{ color: C.mint }}>Just receipts.</span>
      </div>

      <div style={{ position: "absolute", left: 100, top: 470, width: 880 }}>
        {RULES.map(([label, value, pass], i) => {
          const s = spring({ frame: frame - 14 - i * 8, fps, config: { damping: 15, stiffness: 130 } });
          return (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "30px 38px",
                marginBottom: 22,
                borderRadius: 26,
                background: "rgba(12,22,45,0.8)",
                border: `2px solid ${pass ? C.mint : C.gold}66`,
                opacity: s,
                transform: `translateX(${interpolate(s, [0, 1], [-70, 0])}px)`,
              }}
            >
              <span style={{ fontFamily: body, fontSize: 40, color: C.text }}>{label}</span>
              <span
                style={{
                  fontFamily: body,
                  fontWeight: 600,
                  fontSize: 34,
                  color: pass ? C.mint : C.gold,
                }}
              >
                {value}
              </span>
            </div>
          );
        })}
      </div>

      <div
        style={{
          position: "absolute",
          top: 1010,
          width: "100%",
          textAlign: "center",
          fontFamily: body,
          fontSize: 40,
          color: C.muted,
          opacity: spring({ frame: frame - 54, fps, config: { damping: 18 } }),
        }}
      >
        Paper trade it first. Go live only when you're ready.
      </div>

      <Robot delay={10} size={400} x={-300} y={560} glow={C.mint} bob={14} flipped />
    </AbsoluteFill>
  );
};
