import {
  AbsoluteFill,
  Img,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  random,
} from "remotion";
import { C } from "../theme";
import { display, body } from "../fonts";
import { Robot } from "../components/Robot";

const COINS = new Array(12).fill(0);

/** Money shot: the robot pumps coins straight into the wallet. */
export const ScenePump: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({ frame, fps, config: { damping: 18 } });
  const walletIn = spring({ frame: frame - 8, fps, config: { damping: 12, stiffness: 110 } });
  const bump = COINS.reduce((acc, _, i) => {
    const land = 26 + i * 7;
    return frame >= land && frame < land + 6 ? acc + (6 - (frame - land)) * 0.004 : acc;
  }, 0);

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          top: 190,
          width: "100%",
          textAlign: "center",
          fontFamily: display,
          fontSize: 108,
          lineHeight: 1,
          color: C.text,
          letterSpacing: -3,
          textTransform: "uppercase",
          opacity: t,
          transform: `translateY(${interpolate(t, [0, 1], [40, 0])}px)`,
        }}
      >
        It pumps.
        <br />
        <span style={{ color: C.gold }}>You sleep.</span>
      </div>

      <Robot delay={2} size={520} x={-250} y={180} glow={C.blue} bob={16} />

      {COINS.map((_, i) => {
        const start = 20 + i * 7;
        const p = interpolate(frame, [start, start + 26], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        if (frame < start || p >= 1) return null;
        const jitter = (random(`c${i}`) - 0.5) * 90;
        const x = interpolate(p, [0, 1], [-190, 40 + jitter]);
        const y = interpolate(p, [0, 1], [780, 1290]) - Math.sin(p * Math.PI) * 230;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              transform: `translate(-50%,0) translate(${x}px, ${y}px) rotate(${p * 540}deg)`,
              width: 92,
              height: 92,
              borderRadius: "50%",
              background: `radial-gradient(circle at 34% 30%, #FFE07A, ${C.gold})`,
              border: "5px solid #C98A05",
              boxShadow: `0 0 44px ${C.gold}AA`,
              fontFamily: display,
              fontSize: 52,
              color: "#8A5E00",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ₿
          </div>
        );
      })}

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 1240,
          transform: `translateX(-50%) scale(${interpolate(walletIn, [0, 1], [0.6, 1]) + bump})`,
          opacity: walletIn,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "10%",
            borderRadius: "50%",
            background: `radial-gradient(circle, ${C.blue}77 0%, transparent 65%)`,
            filter: "blur(26px)",
          }}
        />
        <Img src={staticFile("images/wallet.png")} style={{ width: 620, height: 620, display: "block" }} />
      </div>
    </AbsoluteFill>
  );
};
