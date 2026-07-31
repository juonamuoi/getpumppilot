import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { C } from "../theme";

/** Persistent animated backdrop: deep navy gradient + drifting grid + glow orbs. */
export const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = (frame * 0.6) % 90;
  const pulse = 0.5 + 0.5 * Math.sin(frame / 24);

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(110% 70% at 50% 8%, ${C.navy} 0%, ${C.bg2} 45%, ${C.bg} 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          opacity: 0.16,
          backgroundImage: `linear-gradient(${C.blue} 1px, transparent 1px), linear-gradient(90deg, ${C.blue} 1px, transparent 1px)`,
          backgroundSize: "90px 90px",
          transform: `translateY(${drift}px)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          left: -220,
          top: 180,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${C.blue}55 0%, transparent 66%)`,
          opacity: 0.5 + 0.3 * pulse,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 760,
          height: 760,
          right: -180,
          bottom: 120,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${C.mint}44 0%, transparent 66%)`,
          opacity: 0.4 + 0.3 * (1 - pulse),
        }}
      />
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, rgba(0,0,0,0.55) 0%, transparent 22%, transparent 78%, rgba(0,0,0,0.65) 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          opacity: interpolate(frame % 12, [0, 6, 12], [0.03, 0.06, 0.03]),
          background:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.6) 0px, rgba(255,255,255,0.6) 1px, transparent 1px, transparent 4px)",
        }}
      />
    </AbsoluteFill>
  );
};
