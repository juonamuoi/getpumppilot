import { AbsoluteFill } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { fade } from "@remotion/transitions/fade";
import { Backdrop } from "./components/Backdrop";
import { SceneHook } from "./scenes/SceneHook";
import { SceneScan } from "./scenes/SceneScan";
import { SceneWhy } from "./scenes/SceneWhy";
import { ScenePump } from "./scenes/ScenePump";
import { SceneCTA } from "./scenes/SceneCTA";

const D = [110, 115, 120, 115, 150];
const T = 15;
export const TOTAL = D.reduce((a, b) => a + b, 0) - T * 4;

const timing = springTiming({ config: { damping: 200 }, durationInFrames: T });

export const MainVideo: React.FC = () => (
  <AbsoluteFill>
    <Backdrop />
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={D[0]}>
        <SceneHook />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={D[1]}>
        <SceneScan />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-left" })} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={D[2]}>
        <SceneWhy />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={D[3]}>
        <ScenePump />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={D[4]}>
        <SceneCTA />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
