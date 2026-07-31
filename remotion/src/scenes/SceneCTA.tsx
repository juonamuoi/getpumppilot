import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { C } from "../theme";
import { display, body } from "../fonts";
import { Robot } from "../components/Robot";

export const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({ frame: frame - 4, fps, config: { damping: 14, stiffness: 120 } });
  const btn = spring({ frame: frame - 26, fps, config: { damping: 11, stiffness: 160 } });
  const pulse = 1 + 0.025 * Math.sin(frame / 6);
  const url = spring({ frame: frame - 40, fps, config: { damping: 18 } });

  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <Robot delay={0} size={620} y={-330} glow={C.mint} bob={14} />

      <div
        style={{
          position: "absolute",
          top: 1000,
          width: 960,
          textAlign: "center",
          opacity: t,
          transform: `translateY(${interpolate(t, [0, 1], [50, 0])}px)`,
        }}
      >
        <div
          style={{
            fontFamily: display,
            fontSize: 120,
            lineHeight: 0.94,
            color: C.text,
            letterSpacing: -4,
            textTransform: "uppercase",
          }}
        >
          Pump<span style={{ color: C.mint }}>Pilot</span> AI
        </div>
        <div style={{ marginTop: 26, fontFamily: body, fontSize: 46, color: C.muted }}>
          Spot momentum. Control risk. Trade smarter.
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 1310,
          transform: `scale(${btn * pulse})`,
          padding: "36px 84px",
          borderRadius: 999,
          background: `linear-gradient(90deg, ${C.mint}, ${C.cyan})`,
          boxShadow: `0 0 90px ${C.mint}66`,
          fontFamily: display,
          fontSize: 58,
          color: "#04220F",
          letterSpacing: -1,
          textTransform: "uppercase",
        }}
      >
        Start free →
      </div>

      <div
        style={{
          position: "absolute",
          top: 1470,
          fontFamily: body,
          fontWeight: 600,
          fontSize: 46,
          color: C.cyan,
          opacity: url,
          letterSpacing: 1,
        }}
      >
        getpumppilot.app
      </div>

      <div
        style={{
          position: "absolute",
          top: 1620,
          width: 900,
          textAlign: "center",
          fontFamily: body,
          fontSize: 26,
          lineHeight: 1.4,
          color: C.muted,
          opacity: url * 0.85,
        }}
      >
        Paper trading by default. Crypto trading involves risk of loss — signals are
        probabilistic, not financial advice. You always sign your own trades.
      </div>
    </AbsoluteFill>
  );
};
