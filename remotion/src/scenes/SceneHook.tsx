import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Sequence } from "remotion";
import { C } from "../theme";
import { display, body } from "../fonts";
import { Robot } from "../components/Robot";

const TICKS = [
  ["SOL", "+41.2%"],
  ["ETH", "+12.8%"],
  ["BTC", "+6.4%"],
  ["BNB", "+19.7%"],
];

export const SceneHook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slam = spring({ frame: frame - 4, fps, config: { damping: 11, stiffness: 220 } });
  const slamScale = interpolate(slam, [0, 1], [1.9, 1]);
  const shake = frame > 4 && frame < 16 ? Math.sin(frame * 3.4) * (16 - frame) * 0.9 : 0;

  const second = spring({ frame: frame - 26, fps, config: { damping: 16 } });

  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      {/* scrolling green ticker */}
      <div
        style={{
          position: "absolute",
          top: 150,
          display: "flex",
          gap: 46,
          transform: `translateX(${-((frame * 5) % 900)}px)`,
          opacity: 0.9,
        }}
      >
        {[...TICKS, ...TICKS, ...TICKS].map(([s, v], i) => (
          <div
            key={i}
            style={{
              fontFamily: body,
              fontSize: 40,
              fontWeight: 600,
              color: C.mint,
              whiteSpace: "nowrap",
              letterSpacing: 1,
            }}
          >
            {s} <span style={{ color: C.text, opacity: 0.65 }}>{v}</span>
          </div>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          top: 268,
          width: 940,
          textAlign: "center",
          transform: `scale(${slamScale}) translateX(${shake}px)`,
          opacity: interpolate(slam, [0, 0.25], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        <div
          style={{
            fontFamily: display,
            fontSize: 148,
            lineHeight: 0.92,
            color: C.text,
            letterSpacing: -4,
            textTransform: "uppercase",
          }}
        >
          Missed
          <br />
          <span style={{ color: C.red }}>another</span>
          <br />
          pump?
        </div>
      </div>

      <Sequence from={26}>
        <div
          style={{
            position: "absolute",
            top: 700,
            width: "100%",
            textAlign: "center",
            fontFamily: body,
            fontSize: 46,
            color: C.muted,
            opacity: second,
            transform: `translateY(${interpolate(second, [0, 1], [30, 0])}px)`,
          }}
        >
          You were asleep. The market wasn't.
        </div>
      </Sequence>

      <Robot delay={18} size={700} y={430} glow={C.blue} />
    </AbsoluteFill>
  );
};
