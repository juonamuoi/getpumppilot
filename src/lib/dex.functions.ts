/* ------------------------------------------------------------------ *
 * Live DEX routing quotes (0x Swap API v2, allowance-holder flow).
 *
 * The API key stays server-side. This function only prices and builds an
 * unsigned transaction; the user signs it in their own wallet.
 * ------------------------------------------------------------------ */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const QuoteInput = z.object({
  chainId: z.number().int().refine((v) => [1, 8453, 42161, 10, 137].includes(v), "Unsupported chain"),
  sellToken: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  buyToken: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  /** Base units, integer string. */
  sellAmount: z.string().regex(/^[0-9]{1,40}$/),
  taker: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  slippageBps: z.number().int().min(5).max(300),
});

export type SwapQuote = {
  ok: boolean;
  error?: string;
  buyAmount?: string;
  minBuyAmount?: string;
  /** Aggregator sources with a non-zero share. */
  route?: { name: string; proportion: number }[];
  /** Set when the sell token needs an ERC-20 approval first. */
  allowanceTarget?: string | null;
  totalNetworkFeeWei?: string | null;
  transaction?: { to: string; data: string; value: string; gas: string | null };
};

export const getSwapQuote = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => QuoteInput.parse(input))
  .handler(async ({ data }): Promise<SwapQuote> => {
    const apiKey = process.env["ZEROX_API_KEY"];
    if (!apiKey) {
      return { ok: false, error: "Live routing is not configured yet (missing DEX aggregator key)." };
    }
    if (data.sellToken.toLowerCase() === data.buyToken.toLowerCase()) {
      return { ok: false, error: "Sell and buy token must differ." };
    }

    const url = new URL("https://api.0x.org/swap/allowance-holder/quote");
    url.searchParams.set("chainId", String(data.chainId));
    url.searchParams.set("sellToken", data.sellToken);
    url.searchParams.set("buyToken", data.buyToken);
    url.searchParams.set("sellAmount", data.sellAmount);
    url.searchParams.set("taker", data.taker);
    url.searchParams.set("slippageBps", String(data.slippageBps));

    try {
      const res = await fetch(url, {
        headers: { "0x-api-key": apiKey, "0x-version": "v2" },
      });
      const body = (await res.json()) as Record<string, any>;
      if (!res.ok) {
        const msg =
          typeof body?.["message"] === "string" ? body["message"] : `Quote failed (${res.status})`;
        return { ok: false, error: msg };
      }
      if (body["liquidityAvailable"] === false) {
        return { ok: false, error: "No liquidity available for this pair and size." };
      }

      const fills: { source: string; proportionBps: string }[] = body["route"]?.fills ?? [];
      return {
        ok: true,
        buyAmount: String(body["buyAmount"] ?? "0"),
        minBuyAmount: String(body["minBuyAmount"] ?? body["buyAmount"] ?? "0"),
        route: fills
          .map((f) => ({ name: f.source, proportion: Number(f.proportionBps ?? 0) / 10_000 }))
          .filter((r) => r.proportion > 0),
        allowanceTarget: body["issues"]?.allowance?.spender ?? null,
        totalNetworkFeeWei: body["totalNetworkFee"] ?? null,
        transaction: body["transaction"]
          ? {
              to: String(body["transaction"].to),
              data: String(body["transaction"].data),
              value: String(body["transaction"].value ?? "0"),
              gas: body["transaction"].gas ? String(body["transaction"].gas) : null,
            }
          : undefined,
      };
    } catch (e) {
      console.error("[getSwapQuote]", e instanceof Error ? e.message : e);
      return { ok: false, error: "Could not reach the routing service. Try again." };
    }
  });

/** Reports whether server-side DEX routing is configured (no secrets exposed). */
export const getDexRoutingStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ configured: boolean; provider: string }> => ({
    configured: Boolean(process.env["ZEROX_API_KEY"]),
    provider: "0x Swap API v2",
  }),
);
