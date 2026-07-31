// CSV export for the live wallet portfolio holdings (read-only snapshot).

export type HoldingExportRow = {
  symbol: string;
  name: string;
  kind: string;
  address?: string;
  amount: number;
  price: number | null;
  value: number | null;
  change24h: number | null;
  usdPeg?: number;
  livePriced: boolean;
  failed: boolean;
  stale: boolean;
  counted: boolean;
};

export type HoldingExportMeta = {
  address: string;
  chainName?: string;
  priceUpdatedAt?: number;
  balancesUpdatedAt?: number;
};

const HEADERS = [
  "symbol",
  "name",
  "type",
  "contract_address",
  "amount",
  "price_usd",
  "value_usd",
  "change_24h_pct",
  "price_source",
  "price_status",
  "included_in_total",
  "price_last_updated_iso",
  "balances_last_updated_iso",
  "wallet_address",
  "chain",
];

function esc(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function priceSourceLabel(r: HoldingExportRow): string {
  if (r.usdPeg != null) return "USD peg (stablecoin)";
  if (r.livePriced) return "CoinGecko live feed";
  if (r.failed) return "CoinGecko (fetch failed)";
  return "no live price";
}

export function priceStatusLabel(r: HoldingExportRow): string {
  if (r.failed) return "unavailable";
  if (r.stale) return "stale";
  if (r.price == null) return "unpriced";
  return "ok";
}

const statusOf = priceStatusLabel;

export function holdingsToCsv(rows: HoldingExportRow[], meta: HoldingExportMeta): string {
  const priceIso = meta.priceUpdatedAt ? new Date(meta.priceUpdatedAt).toISOString() : "";
  const balIso = meta.balancesUpdatedAt
    ? new Date(meta.balancesUpdatedAt).toISOString()
    : "";
  const lines = [HEADERS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.symbol,
        r.name,
        r.kind,
        r.address ?? "",
        r.amount,
        r.price ?? "",
        r.value ?? "",
        r.change24h ?? "",
        priceSourceLabel(r),
        statusOf(r),
        r.counted ? "yes" : "no",
        priceIso,
        balIso,
        meta.address,
        meta.chainName ?? "",
      ]
        .map(esc)
        .join(","),
    );
  }
  return lines.join("\n");
}

export function holdingsCsvFilename(meta: HoldingExportMeta, now = new Date()): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const addr = meta.address ? meta.address.slice(0, 6) : "wallet";
  return `pumppilot-holdings-${addr}-${stamp}.csv`;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
