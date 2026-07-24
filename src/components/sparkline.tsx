import { Line, LineChart, ResponsiveContainer } from "recharts";

export function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  const rows = data.map((v, i) => ({ i, v }));
  const stroke = positive ? "oklch(0.75 0.17 155)" : "oklch(0.65 0.22 20)";
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Line type="monotone" dataKey="v" stroke={stroke} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
