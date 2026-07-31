export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string; // ISO publish date
  /** ISO last-updated date; falls back to `date` for dateModified. */
  updated?: string;
  readMinutes: number;
  keywords: string[];
  tags: string[];
  /** Unique social/share cover image path (served from /public). */
  image?: string;
  imageAlt?: string;
  /** Author key from AUTHORS in structured-data (defaults to the editorial team). */
  author?: string;
  // Body is an array of blocks for simple structured rendering.
  body: BlogBlock[];
}

export type BlogBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "quote"; text: string }
  | { type: "cta"; text: string; href: string; label: string };

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "how-to-backtest-crypto-momentum",
    image: "/blog/how-to-backtest-crypto-momentum.jpg",
    imageAlt: "Neon candlestick price history with translucent rule-check panels overlaid",
    title: "How to Backtest a Crypto Momentum Strategy (and Read the 'Why')",
    description:
      "A practical guide to backtesting a crypto momentum strategy in PumpPilot AI: build the rules, replay them over history, and read which rules fired, which near-missed, and whether the edge is real.",
    date: "2026-07-31",
    readMinutes: 9,
    keywords: [
      "crypto backtesting",
      "backtest trading strategy",
      "backtest crypto momentum strategy",
      "momentum strategy backtest",
      "explainable ai trading",
    ],
    tags: ["Guides", "Backtesting"],
    body: [
      { type: "p", text: "A backtest is not a promise of profit — it is a cheap way to find out that an idea is wrong before it costs you money. This guide walks through backtesting a crypto momentum strategy end to end in the PumpPilot AI Strategy Builder, and, more importantly, how to read which rules actually drove the result." },
      { type: "h2", text: "Step 1 — Write the strategy as explicit rules" },
      { type: "p", text: "Momentum is not a feeling; it is a set of thresholds. Before you replay anything, express the strategy as rules the engine can evaluate bar by bar, each with an operator and a threshold you can defend." },
      { type: "ul", items: [
        "Entry trigger — momentum score above a threshold (e.g. score > 75)",
        "Confirmation — volume or liquidity filter so thin books can't fake a breakout",
        "Volatility guard — skip entries when realised volatility is in the top decile",
        "Exit — a fixed stop, a trailing stop, or a momentum-decay exit",
        "Sizing — a fixed fraction of equity, not a gut-feel position",
      ]},
      { type: "h2", text: "Step 2 — Choose a window that includes a drawdown" },
      { type: "p", text: "A backtest that only covers an uptrend measures the trend, not the strategy. Pick a window that contains at least one sharp drawdown and one chop phase. If a momentum rule only survives when everything rises, it is a beta bet in disguise." },
      { type: "h2", text: "Step 3 — Replay and read the rule impact panel" },
      { type: "p", text: "Running the backtest is the easy part. The panel that matters afterwards is rule impact: for every bar the engine tells you which rules passed, which failed, and by how much. That is what turns a P&L number into a lesson." },
      { type: "ul", items: [
        "Fired — the rules that cleared their thresholds and produced the entry",
        "Near-miss — rules that failed by a small margin; these are your tuning candidates",
        "Blocking — the single rule that most often vetoed otherwise-good setups",
        "Risk bounds — whether a fill was resized or skipped by your exposure caps",
      ]},
      { type: "h2", text: "Step 4 — Judge the result with the right metrics" },
      { type: "p", text: "Total return is the least useful number on the page. Look at expectancy per trade, profit factor, maximum drawdown, and sample size. Fewer than about 100 trades is a story, not evidence." },
      { type: "quote", text: "If you can't name the rule that produced the edge, you don't have an edge — you have a lucky window." },
      { type: "h2", text: "Step 5 — Tune once, then re-validate" },
      { type: "p", text: "Use the near-miss list to propose a single threshold change, preview the before/after impact, and re-run. Change one variable at a time, keep the tuning history, and revert anything that only improves the in-sample window. Every tuning step in PumpPilot AI is logged with a plain-English reason so you can see exactly what changed and undo it in one click." },
      { type: "h2", text: "Common ways backtests lie" },
      { type: "ul", items: [
        "Overfitting — tuning until the curve is pretty on one window",
        "Survivorship — testing only tokens that still exist today",
        "Look-ahead — using a value the bar hadn't produced yet",
        "Ignoring costs — fees, spread and slippage quietly delete thin edges",
        "Too few trades — noise dressed up as a strategy",
      ]},
      { type: "h2", text: "Then rehearse it on paper" },
      { type: "p", text: "A passing backtest earns a strategy the right to be paper traded, nothing more. Run it forward in paper mode until the live expectancy roughly matches the backtest before you even consider real capital." },
      { type: "h2", text: "Important disclaimer" },
      { type: "p", text: "PumpPilot AI is educational. Backtests use historical and demo data, past results never guarantee future returns, signals are probabilistic, and you can lose all your capital. Nothing here is financial advice." },
      { type: "cta", text: "Build and replay your first strategy", href: "/pricing", label: "Start free" },
    ],
  },
  {
    slug: "best-ai-investment-app-2026",
    image: "/blog/best-ai-investment-app-2026.jpg",
    imageAlt: "Abstract rising candlestick chart in teal and violet on a dark background",
    title: "Best AI Investment App in 2026: An Honest Comparison",
    description:
      "How to choose the best AI investment app in 2026. We compare explainability, safety, paper trading, and live execution across the top AI trading platforms.",
    date: "2026-07-15",
    readMinutes: 8,
    keywords: [
      "best ai investment app",
      "ai trading app",
      "ai crypto trading",
      "ai portfolio manager",
    ],
    tags: ["Guides", "AI"],
    body: [
      { type: "p", text: "Everyone claims to have the 'best AI investment app.' Very few can explain why their model made a call, show you the exact risk you're taking, or let you rehearse a strategy before a single dollar is at risk. This guide breaks down what actually matters." },
      { type: "h2", text: "The 5 things that separate great AI investment apps from marketing" },
      { type: "ul", items: [
        "Explainable signals — every score should tell you what drove it",
        "Paper trading by default — never gamble to learn",
        "Risk controls that are locked, not optional",
        "Backtesting on real historical data",
        "A community layer to compare and fork strategies",
      ]},
      { type: "h2", text: "How PumpPilot AI stacks up" },
      { type: "p", text: "PumpPilot AI is built around the principle that if the model can't explain itself, you shouldn't trust it. Every momentum score comes with a plain-English breakdown, every alert shows exactly which rule fired, and live execution stays disabled behind a locked master switch until you deliberately turn it on." },
      { type: "cta", text: "See it in action", href: "/pricing", label: "View pricing" },
    ],
  },
  {
    slug: "ai-crypto-trading-explained",
    image: "/blog/ai-crypto-trading-explained.jpg",
    imageAlt: "Glowing neural-network brain above a crypto price waveform",
    title: "AI Crypto Trading, Explained: Signals, Risk, and Realistic Returns",
    description:
      "What AI crypto trading actually does — how momentum signals work, why explainability matters, and how to avoid the biggest mistakes new traders make.",
    date: "2026-07-08",
    readMinutes: 6,
    keywords: [
      "ai crypto trading",
      "crypto momentum signals",
      "ai trading explained",
    ],
    tags: ["Education", "AI"],
    body: [
      { type: "p", text: "AI crypto trading isn't a magic money button. It's pattern recognition, risk math, and disciplined execution — done faster than any human can do it manually. Here's what's really going on under the hood." },
      { type: "h2", text: "What a momentum signal actually measures" },
      { type: "p", text: "A momentum score blends short-term price velocity, volume acceleration, volatility regime, and cross-market context. Any model that gives you one number without showing the ingredients is asking you to take it on faith." },
      { type: "h2", text: "Why explainability changes everything" },
      { type: "p", text: "When a signal is transparent, you can override it when your judgement disagrees, tighten thresholds when the market shifts, and learn from every trade. Black-box AI takes those levers away." },
      { type: "cta", text: "Try the AI Copilot free", href: "/dashboard", label: "Open dashboard" },
    ],
  },
  {
    slug: "paper-trading-vs-live-trading",
    image: "/blog/paper-trading-vs-live-trading.jpg",
    imageAlt: "Split view contrasting a simulated chart with a live chart",
    title: "Paper Trading vs Live Trading: The Case for Rehearsal",
    description:
      "Why paper trading is the single highest-ROI habit for new traders — and how to know when a strategy is actually ready for live capital.",
    date: "2026-06-28",
    readMinutes: 5,
    keywords: [
      "paper trading",
      "paper trading vs live",
      "crypto simulator",
    ],
    tags: ["Education"],
    body: [
      { type: "p", text: "Every professional trader you admire ran thousands of simulated trades before risking real money. Paper trading is not a beginner's toy — it's rehearsal." },
      { type: "h2", text: "The 3-month readiness rule" },
      { type: "ul", items: [
        "Positive expectancy over at least 100 simulated trades",
        "Max drawdown below your personal loss tolerance",
        "Consistent behavior across bull, chop, and bear regimes",
      ]},
      { type: "quote", text: "If you can't stay profitable on paper, you will not be profitable live. Full stop." },
      { type: "cta", text: "Start paper trading now", href: "/paper", label: "Open paper trading" },
    ],
  },
  {
    slug: "pumppilot-vs-autopilot-comparison",
    image: "/blog/pumppilot-vs-autopilot-comparison.jpg",
    imageAlt: "Two glowing orbs facing off, representing two trading approaches",
    title: "PumpPilot AI vs Autopilot App: Explainable Momentum vs Copy Trading",
    description:
      "A side-by-side comparison of PumpPilot AI and copy-trading autopilot apps: explainable momentum scores and paper trading first, versus mirroring someone else's trades.",
    date: "2026-07-28",
    readMinutes: 7,
    keywords: [
      "autopilot app",
      "autopilot investing app",
      "copy trading app",
      "pumppilot vs autopilot",
      "ai investment app comparison",
    ],
    tags: ["Guides", "Comparisons"],
    body: [
      { type: "p", text: "Autopilot-style apps became popular by making investing feel effortless: pick someone to follow, and their trades are mirrored into your account. PumpPilot AI takes the opposite route — it shows you why a signal fired and asks you to rehearse it on paper before any capital is at risk. Both are 'automated'; only one is explainable." },
      { type: "h2", text: "The core difference: copy the trader, or understand the signal" },
      { type: "p", text: "Copy trading outsources judgement. You inherit another person's timing, position sizing, and risk appetite — including the parts they never explain. PumpPilot AI keeps the decision with you: every momentum score breaks down into the exact rules that fired, the thresholds they cleared, and how close the ones that failed came to passing." },
      { type: "h2", text: "Side-by-side" },
      { type: "ul", items: [
        "Signal source — Autopilot apps: another trader's live positions. PumpPilot AI: rule-based momentum scores you can inspect and tune.",
        "Explainability — Autopilot apps: usually none beyond a track record. PumpPilot AI: plain-English reasons on every score and alert.",
        "Default mode — Autopilot apps: real money from day one. PumpPilot AI: paper trading by default, live execution locked.",
        "Risk controls — Autopilot apps: inherited from whoever you follow. PumpPilot AI: your own exposure caps, position sizing and fragility bounds.",
        "Rehearsal — Autopilot apps: rarely offered. PumpPilot AI: backtesting plus a trade journal that measures expectancy and profit factor.",
        "Custody — Autopilot apps: brokerage account linkage. PumpPilot AI: read-only wallet connection, never a seed phrase or private key.",
      ]},
      { type: "h2", text: "Why paper-trading-first matters more than automation" },
      { type: "p", text: "Automation multiplies whatever process you already have. If the process is 'follow a stranger', automation multiplies that risk too. PumpPilot AI's paper-first philosophy exists so you can find out whether a strategy has positive expectancy across at least 100 simulated trades before it can cost you anything." },
      { type: "quote", text: "An app that can't explain a trade can't teach you to make a better one." },
      { type: "h2", text: "Where copy trading still makes sense" },
      { type: "p", text: "If you have no interest in learning market mechanics and are comfortable with the risk of a strategy you can't inspect, copy trading is genuinely lower effort. PumpPilot AI is for the opposite investor: someone who wants the reasoning, the risk numbers and the rehearsal loop." },
      { type: "h2", text: "Important disclaimer" },
      { type: "p", text: "PumpPilot AI is educational. All in-app market data is mock/demo data, predictions are probabilistic, returns are not guaranteed, and you can lose all your capital. Nothing here is financial advice." },
      { type: "cta", text: "Try the explainable approach with 100 free credits", href: "/pricing", label: "Start free" },
    ],
  },
  {
    slug: "pumppilot-vs-tradingview-paper-trading",
    image: "/blog/pumppilot-vs-tradingview-paper-trading.jpg",
    imageAlt: "Chart grid beside a glowing momentum score dial",
    title: "PumpPilot AI vs TradingView Paper Trading: Charts vs the 'Why'",
    description:
      "TradingView gives you the charts; PumpPilot AI gives you the reasoning. A head-to-head on crypto paper trading, explainable AI momentum signals and risk coaching.",
    date: "2026-07-28",
    readMinutes: 7,
    keywords: [
      "paper trading",
      "crypto paper trading",
      "tradingview paper trading",
      "trading simulator",
      "pumppilot vs tradingview",
    ],
    tags: ["Guides", "Comparisons"],
    body: [
      { type: "p", text: "TradingView is the default charting tool for most traders, and its paper trading module is a solid simulator: you can place simulated orders straight from a chart and watch a hypothetical balance move. What it deliberately does not do is tell you why a setup is worth taking, or whether your risk is sane. That gap is exactly where PumpPilot AI lives." },
      { type: "h2", text: "The core difference: execution surface vs explanation layer" },
      { type: "p", text: "TradingView's simulator answers 'what happened when I clicked buy'. PumpPilot AI answers 'why did this token score 84, which rules fired, which nearly failed, and what does that mean for your downside'. One is a canvas; the other is a coach." },
      { type: "h2", text: "Side-by-side for crypto paper trading" },
      { type: "ul", items: [
        "Charting depth — TradingView: best in class, hundreds of indicators. PumpPilot AI: focused momentum views, not a charting replacement.",
        "Signal explanation — TradingView: you build and interpret indicators yourself. PumpPilot AI: plain-English reasons behind every momentum score.",
        "Risk coaching — TradingView: manual. PumpPilot AI: exposure caps, position sizing and fragility bounds enforced before a simulated fill.",
        "Rule tuning — TradingView: Pine Script. PumpPilot AI: threshold sliders with before/after impact previews and an audit trail.",
        "Journaling — TradingView: basic trade list. PumpPilot AI: expectancy, profit factor and per-trade reasoning in the journal.",
        "Wallet safety — TradingView: not applicable. PumpPilot AI: read-only wallet scanning for drainer approvals, never a seed phrase.",
      ]},
      { type: "h2", text: "Use both: chart on TradingView, rehearse and reason in PumpPilot AI" },
      { type: "p", text: "These are not mutually exclusive. Many traders chart on TradingView and use PumpPilot AI to sanity-check momentum quality, size the position, and rehearse the strategy across at least 100 simulated trades before risking anything real." },
      { type: "quote", text: "A simulator tells you what a trade did. An explainable system tells you whether you should have taken it." },
      { type: "h2", text: "Why explainability changes how fast you improve" },
      { type: "p", text: "When a simulated trade loses, a bare P&L number teaches almost nothing. When the log says the entry cleared momentum by 2 points but failed the volume filter, and volatility was in the top decile, you have a concrete rule to tighten. That feedback loop is the entire point of paper trading." },
      { type: "h2", text: "Important disclaimer" },
      { type: "p", text: "PumpPilot AI is educational. All in-app market data is mock/demo data, predictions are probabilistic, returns are not guaranteed, and you can lose all your capital. Nothing here is financial advice." },
      { type: "cta", text: "Rehearse your next setup risk-free", href: "/paper", label: "Open paper trading" },
    ],
  },
];


export function getPostBySlug(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}
