import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  prompt: z.string().min(1).max(6000),
  system: z.string().max(4000).optional(),
});

export const askCopilot = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const system =
      data.system ??
      "You are PumpPilot AI Copilot — a friendly, cautious crypto investing coach for a paper-trading app. " +
        "Always: use plain English, be concise (max 180 words), use short bullets when helpful, and end with a one-line risk reminder. " +
        "Never guarantee returns. Never recommend specific real trades with real money. All prices are DEMO data. " +
        "Prefer explaining WHY over predicting WHAT. If asked about live trading, remind the user live execution is locked in this build.";

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: data.prompt },
        ],
        temperature: 0.4,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 429)
        return { ok: false as const, error: "AI is rate-limited right now. Try again in a moment." };
      if (res.status === 402)
        return {
          ok: false as const,
          error: "AI credits exhausted. Add credits in workspace billing settings.",
        };
      return { ok: false as const, error: `AI error (${res.status}): ${text.slice(0, 160)}` };
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content?.trim() ?? "";
    return { ok: true as const, content };
  });
