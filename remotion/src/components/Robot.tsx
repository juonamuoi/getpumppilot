import { Img, staticFile, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";

type Props = {
  /** frame offset for the entrance spring */
  delay?: number;
  size?: number;
  x?: number;
  y?: number;
  rotate?: number;
  /** bob amplitude in px */
  bob?: number;
  glow?: string;
  flipped?: boolean;
};

/** The PumpPilot robot — the ad's main character. Hovers with idle bob + glow. */
export const Robot: React.FC<Props> = ({
  delay = 0,
  size = 620,
  x = 0,
  y = 0,
  rotate = 0,
  bob = 18,
  glow = "#2563FF",
  flipped = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({ frame: frame - delay, fps, config: { damping: 13, stiffness: 90, mass: 1.1 } });
  const scale = interpolate(enter, [0, 1], [0.55, 1]);
  const rise = interpolate(enter, [0, 1], [140, 0]);
  const float = Math.sin((frame - delay) / 18) * bob;
  const tilt = Math.sin((frame - delay) / 26) * 2.5;

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: `translate(-50%, -50%) translate(${x}px, ${y + rise + float}px) scale(${scale}) rotate(${rotate + tilt}deg) scaleX(${flipped ? -1 : 1})`,
        opacity: interpolate(enter, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }),
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "12% 8%",
          borderRadius: "50%",
          background: `radial-gradient(circle, ${glow}66 0%, transparent 68%)`,
          filter: "blur(30px)",
        }}
      />
      <Img src={staticFile("images/robot.png")} style={{ width: size, height: size, display: "block" }} />
    </div>
  );
};
