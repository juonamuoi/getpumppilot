import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Sequence } from "remotion";
import { C } from "../theme";
import { display, body } from "../fonts";
import { Robot } from "../components/Robot";

const BARS = [0.32, 0.28, 0.4, 0.35, 0.5, 0.44, 0.58, 0.52, 0.7, 0.64, 0.86, 1];

/** Robot scans the market: candles build, a breakout is flagged. */
export const SceneScan: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const title = spring({ frame, fps, config: { damping: 18 } });
  const sweep = interpolate(frame, [10, 55], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          top: 190,
          width: "100%",
          textAlign: "center",
          fontFamily: display,
          fontSize: 104,
          lineHeight: 1,
          color: C.text,
          letterSpacing: -3,
          textTransform: "uppercase",
          opacity: title,
          transform: `translateY(${interpolate(title, [0, 1], [40, 0])}px)`,
        }}
      >
        Your bot
        <br />
        <span style={{ color: C.cyan }}>never sleeps</span>
      </div>

      {/* chart card */}
      <div
        style={{
          position: "absolute",
          left: 90,
          top: 470,
          width: 900,
          height: 500,
          borderRadius: 40,
          background: "rgba(12,22,45,0.72)",
          border: `2px solid ${C.blue}55`,
          boxShadow: `0 40px 90px rgba(0,0,0,0.55)`,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 44,
            top: 34,
            fontFamily: body,
            fontSize: 30,
            color: C.muted,
            letterSpacing: 2,
          }}
        >
          MOMENTUM SCAN · 24/7
        </div>

        <div
          style={{
            position: "absolute",
            left: 44,
            right: 44,
            bottom: 48,
            height: 320,
            display: "flex",
            alignItems: "flex-end",
            gap: 22,
          }}
        >
          {BARS.map((h, i) => {
            const g = spring({ frame: frame - 12 - i * 3, fps, config: { damping: 16, stiffness: 140 } });
            const hot = i >= BARS.length - 2;
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 320 * h * g,
                  borderRadius: 12,
                  background: hot
                    ? `linear-gradient(180deg, ${C.mint}, ${C.cyan})`
                    : `linear-gradient(180deg, ${C.blue}, ${C.blue}44)`,
                  boxShadow: hot ? `0 0 40px ${C.mint}88` : "none",
                }}
              />
            );
          })}
        </div>

        {/* scan sweep */}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${sweep * 100}%`,
            width: 6,
            background: `linear-gradient(180deg, transparent, ${C.cyan}, transparent)`,
            boxShadow: `0 0 40px ${C.cyan}`,
            opacity: sweep > 0 && sweep < 1 ? 1 : 0,
          }}
        />
      </div>

      <Sequence from={52}>
        <Flag />
      </Sequence>

      <Robot delay={6} size={480} x={300} y={620} glow={C.cyan} bob={12} />
    </AbsoluteFill>
  );
};

const Flag: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 10, stiffness: 180 } });
  const pulse = 1 + 0.03 * Math.sin(frame / 5);
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: 1050,
        transform: `translateX(-50%) scale(${s * pulse})`,
        padding: "20px 40px",
        borderRadius: 999,
        background: `${C.mint}1F`,
        border: `2px solid ${C.mint}`,
        fontFamily: body,
        fontWeight: 600,
        fontSize: 34,
        color: C.mint,
        letterSpacing: 1,
        whiteSpace: "nowrap",
        boxShadow: `0 0 60px ${C.mint}55`,
      }}
    >
      SIGNAL FIRED · SOL 92/100
    </div>
  );
};
