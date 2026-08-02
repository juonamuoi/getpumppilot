import { buildRecoveryGuideDoc } from "/tmp/qa/guide.ts";
const doc = await buildRecoveryGuideDoc({ address: "0x9A3f21bC4d5E6f7081239aBcDeF0123456789abc" });
await Bun.write("/tmp/qa/out.pdf", doc.output("arraybuffer"));
