// Frequentist helpers for A/B creative comparison.
// All functions are pure so they can be unit-tested and reused in reports.

export type Interval = { low: number; high: number };

/** Standard normal CDF (Abramowitz & Stegun 7.1.26 based erf approximation). */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

const Z_FOR_LEVEL: Record<number, number> = { 90: 1.6449, 95: 1.96, 99: 2.5758 };

export function zForLevel(level: number): number {
  return Z_FOR_LEVEL[level] ?? 1.96;
}

/**
 * Wilson score interval for a binomial proportion — stable at small samples
 * and near 0%/100%, unlike the normal approximation. Returns percentages.
 */
export function wilsonInterval(successes: number, trials: number, level = 95): Interval {
  if (!trials) return { low: 0, high: 0 };
  const z = zForLevel(level);
  const p = successes / trials;
  const denom = 1 + (z * z) / trials;
  const center = p + (z * z) / (2 * trials);
  const margin = z * Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials));
  return {
    low: Math.max(0, ((center - margin) / denom) * 100),
    high: Math.min(100, ((center + margin) / denom) * 100),
  };
}

export type ComparisonResult = {
  /** Absolute lift in percentage points (a - b). */
  liftPp: number;
  /** Relative lift as a percentage of the baseline rate. */
  liftRelative: number;
  zScore: number;
  /** Two-sided p-value. */
  pValue: number;
  significant: boolean;
  /** CI for the difference in rates, percentage points. */
  diffInterval: Interval;
  /** Not enough traffic for the normal approximation to be trustworthy. */
  underpowered: boolean;
};

/** Two-proportion z-test (pooled) between a challenger and a baseline. */
export function compareProportions(
  aSuccesses: number,
  aTrials: number,
  bSuccesses: number,
  bTrials: number,
  level = 95,
): ComparisonResult | null {
  if (!aTrials || !bTrials) return null;
  const p1 = aSuccesses / aTrials;
  const p2 = bSuccesses / bTrials;
  const pooled = (aSuccesses + bSuccesses) / (aTrials + bTrials);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / aTrials + 1 / bTrials));
  const z = se === 0 ? 0 : (p1 - p2) / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  const seDiff = Math.sqrt((p1 * (1 - p1)) / aTrials + (p2 * (1 - p2)) / bTrials);
  const zc = zForLevel(level);
  const diff = (p1 - p2) * 100;
  const alpha = (100 - level) / 100;
  return {
    liftPp: diff,
    liftRelative: p2 === 0 ? 0 : ((p1 - p2) / p2) * 100,
    zScore: z,
    pValue,
    significant: pValue < alpha,
    diffInterval: { low: diff - zc * seDiff * 100, high: diff + zc * seDiff * 100 },
    underpowered:
      aSuccesses < 5 || bSuccesses < 5 || aTrials - aSuccesses < 5 || bTrials - bSuccesses < 5,
  };
}

/**
 * Sample size (per arm) needed to detect the observed lift at the given
 * confidence with 80% power. Useful for "keep the test running" guidance.
 */
export function requiredSamplePerArm(
  baselineRate: number,
  liftAbsolute: number,
  level = 95,
): number | null {
  if (liftAbsolute <= 0 || baselineRate <= 0 || baselineRate >= 1) return null;
  const p2 = Math.min(0.999999, baselineRate + liftAbsolute);
  const zAlpha = zForLevel(level);
  const zBeta = 0.8416; // 80% power
  const pBar = (baselineRate + p2) / 2;
  const n =
    Math.pow(
      zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) +
        zBeta * Math.sqrt(baselineRate * (1 - baselineRate) + p2 * (1 - p2)),
      2,
    ) / Math.pow(liftAbsolute, 2);
  return Math.ceil(n);
}

export function formatP(p: number): string {
  if (p < 0.001) return "p < 0.001";
  return `p = ${p.toFixed(3)}`;
}
