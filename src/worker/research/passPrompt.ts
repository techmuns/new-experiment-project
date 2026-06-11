import type {
  MemoUnderstandingDigest,
  MemoUnderstandingResearchTask,
  ResearchPassCompanyAliases,
  ResearchPassId,
  ResearchPassRequest,
} from "@shared/types";

export const RESEARCH_PASS_IDS: readonly ResearchPassId[] = [
  "official_results",
  "management_call",
  "investor_presentation",
  "press_and_results",
  "valuation_market",
  "risks_competition",
] as const;

export const RESEARCH_PASS_TITLES: Record<ResearchPassId, string> = {
  official_results: "Official results / exchange filings",
  management_call: "Earnings call / management commentary",
  investor_presentation: "Investor presentation / IR deck",
  press_and_results: "Financial press / result summaries",
  valuation_market: "Valuation / market movement",
  risks_competition: "Risks / macro / competition / AI",
};

export interface BuildResearchPassPromptResult {
  system: string;
  user: string;
}

const SHARED_SYSTEM_LINES = [
  "You are a buy-side investment analyst running ONE focused research pass on a public company you are following.",
  "Your job in THIS pass is to discover developments — in the narrow scope below — between the detected memo period and today that materially affect the original investment thesis.",
  "",
  "Hard rules:",
  "- Use only sources you actually found via the web_search tool. NEVER invent URLs, dates, publishers, or quotes.",
  "- If you cannot find any usable source for this pass, return findings: [] with a warning that says so. That is a legitimate, non-failing outcome — the orchestrator combines this pass with five others.",
  "- For each finding you DO emit, give a short stable id (e.g. 'f01', 'f02'), classify it under one of the schema's enumerated categories, choose impact ∈ {positive, negative, neutral, watch}.",
  "- Write `summary` in 2–4 sentences max. Write `relevance` in 1–2 sentences. Number-led where possible. No generic hedging. No fake precision.",
  "- Cite every source you used. Each source object MUST carry title, url, tier, and (when known) date and a short note.",
  "- Source priority (HARD ranking — never upgrade a source you cannot verify): official > company > exchange > transcript > press > market_data > other. The server will only ever DOWNGRADE your tier — never upgrade — so be honest.",
  "- The HIGHEST-tier source must come first in each finding's `sources[]`.",
  "- If your only source is `press` / `market_data` / `other`, set impact to `watch` or `neutral` (the server will downgrade non-neutral findings without a primary-tier verified source).",
  "- If a finding clearly maps to one of the thesis checkpoints provided in the user prompt, set thesisCheckpointId to that checkpoint id; otherwise null.",
  "- Emit a SINGLE JSON object matching the schema (`findings`, `unresolvedQuestions`, `warnings`). No prose outside the JSON.",
];

const PASS_BLOCKS: Record<ResearchPassId, string> = {
  official_results: [
    "Pass: OFFICIAL RESULTS / EXCHANGE FILINGS / SHAREHOLDING PATTERN.",
    "Scope: this pass MUST cover BOTH (a) latest quarterly / annual / interim official results AND (b) the company's latest SHAREHOLDING PATTERN filing.",
    "Preferred sources: company investor relations page, BSE/NSE/SEC/SEBI filings, official earnings releases, 10-K/10-Q/20-F documents, BSE/NSE shareholding-pattern filings, Screener.in 'Shareholding' page (treat as aggregator of filings).",
    "Categories: financials, filings, guidance.",
    "Target 2–4 findings. At least ONE finding MUST cover the shareholding pattern (category: 'filings'). Anchor on official documentation, not press summaries.",
    "For the shareholding-pattern finding, you MUST quote SPECIFIC percentages AND, where the filing or Screener.in surfaces them, NAMED institutional holders (e.g. 'HDFC Mutual Fund added 1.4 ppt to 3.1%', 'Government Pension Fund Global exited'). Do NOT invent fund names. Cover, in this order: promoter holding + pledge, FII holding (name top movers if surfaced), DII / mutual fund holding (name top movers), public/retail, plus any QIP / preferential / buyback / insider trade visible.",
    "If only press summaries exist (no primary doc), emit a coverage-gap finding (impact: neutral, category: 'filings') saying so — but still ATTEMPT the shareholding-pattern finding before giving up.",
  ].join("\n"),
  management_call: [
    "Pass: EARNINGS CALL / MANAGEMENT COMMENTARY.",
    "Scope: find the company's most recent earnings call transcript, management commentary, conference call highlights, call Q&A excerpts.",
    "Preferred sources: company-hosted transcripts, exchange filings of the earnings call, Seeking Alpha / Motley Fool transcripts, Reuters/Bloomberg call summaries.",
    "Categories: management, broker_consensus.",
    "Target 1–3 findings. Focus on management TONE shifts, kept vs missed commitments, segment guidance, M&A / capex remarks.",
    "If no transcript or call summary is available for the latest period, emit a coverage-gap finding (impact: neutral, category: 'management').",
  ].join("\n"),
  investor_presentation: [
    "Pass: INVESTOR PRESENTATION / IR DECK.",
    "Scope: find the company's most recent investor presentation / results deck / IR slides for the detected period.",
    "Preferred sources: company IR pages, exchange-filed presentations, official PDF decks.",
    "Categories: management, financials, guidance.",
    "Target 1–2 findings. Pull headline slides (segment growth, capacity, capex plan, guidance, valuation anchors).",
    "If no investor presentation can be located for the latest period, emit a coverage-gap finding (impact: neutral).",
  ].join("\n"),
  press_and_results: [
    "Pass: FINANCIAL PRESS / RESULT SUMMARIES.",
    "Scope: find credible business-press summaries of the latest results — ONLY to supplement or substitute when official sources are unavailable.",
    "Preferred sources: Reuters, Bloomberg, FT, WSJ, CNBC, Economic Times, Mint, Business Standard, Moneycontrol, BusinessLine.",
    "Categories: financials, management, broker_consensus, peers, other.",
    "Target 1–3 findings. NEVER assert a positive/negative directional claim from press alone — set impact to `watch` when your only source is press. The server will enforce this rule.",
    "If only aggregator/blog sources are available (no credible press), emit a coverage-gap finding (impact: neutral, category: 'other').",
  ].join("\n"),
  valuation_market: [
    "Pass: VALUATION / MARKET MOVEMENT.",
    "Scope: find recent valuation multiples (P/E, EV/EBITDA), market cap, share price moves, broker target prices, peer-set comparisons.",
    "Preferred sources: Screener.in, Tickertape, Yahoo Finance, TradingView, WSJ market data, broker note summaries from credible press.",
    "Categories: valuation, peers, broker_consensus.",
    "Target 1–3 findings. Quote exact multiples / prices verbatim from the source — never paraphrase numerically.",
    "If current price or multiple cannot be source-verified, say 'current price not source-verified in this pass' in the finding's summary. Do NOT invent numbers.",
  ].join("\n"),
  risks_competition: [
    "Pass: RISKS / MACRO / COMPETITION / AI.",
    "Scope: find recent developments in macro environment, regulatory changes, competitive moves, AI / technology risk where genuinely material to the thesis.",
    "Preferred sources: Reuters/Bloomberg/FT for macro+regulatory, peer-company filings/transcripts for competitive moves, credible analyst notes for AI/tech risk.",
    "Categories: macro, peers, ai_tech_risk, other.",
    "Target 1–3 findings. Each must tie to a thesis assumption or checkpoint — generic 'macro is uncertain' framing is not allowed.",
    "If nothing material surfaced in this pass, emit a single coverage-gap finding (impact: neutral, category: 'other').",
  ].join("\n"),
};

export function buildResearchPassPrompt(
  req: ResearchPassRequest,
): BuildResearchPassPromptResult {
  const block = PASS_BLOCKS[req.passId];
  const title = RESEARCH_PASS_TITLES[req.passId];

  const systemLines = [
    ...SHARED_SYSTEM_LINES,
    "",
    `Target pass: ${req.passId} — ${title}.`,
    block,
  ];
  if (req.retryCompact) {
    systemLines.push(
      "",
      "Compact retry: aim for 1–2 findings only, tighter prose, max 2 sources per finding.",
    );
  }

  return {
    system: systemLines.join("\n"),
    user: buildUserPrompt(req),
  };
}

function buildUserPrompt(req: ResearchPassRequest): string {
  const { project, companyAliases, dna, detection, thesisCheckpoints, retryCompact } = req;
  const lines: string[] = [];

  lines.push("# 1. Company identity");
  lines.push("Search across ALL aliases below; prefer the most official form when emitting source titles:");
  for (const alias of formatAliases(companyAliases)) {
    lines.push(`- ${alias}`);
  }
  if (project.sector) lines.push(`- Sector: ${project.sector}`);

  lines.push("");
  lines.push("# 2. Research window");
  lines.push(`- Memo latest period (label only): ${detection.periodLabel}`);
  if (detection.researchStart) {
    lines.push(
      `- Look for developments BETWEEN ${detection.researchStart} and ${detection.researchCurrent} (inclusive).`,
    );
  } else {
    lines.push(
      `- Memo period is fiscal-label-only (no calendar mapping). Look for developments from the most recent quarter attributable to the company, through ${detection.researchCurrent}. Acknowledge this assumption in warnings[].`,
    );
  }
  if (detection.assumptionNotes && detection.assumptionNotes.length > 0) {
    lines.push("- Period assumption notes to acknowledge:");
    for (const note of detection.assumptionNotes) lines.push(`  - ${note}`);
  }

  lines.push("");
  lines.push("# 3. Original thesis context (compact — NO full memo text)");
  if (dna.originalThesisHead) {
    lines.push(`- Original thesis: ${dna.originalThesisHead}`);
  }
  if (dna.toneAdjectives.length > 0) {
    lines.push(`- Memo tone adjectives: ${dna.toneAdjectives.join(", ")}`);
  }
  if (dna.analyticalFramework.length > 0) {
    lines.push(`- Analytical framework: ${dna.analyticalFramework.join("; ")}`);
  }
  const assumptionCap = retryCompact ? 3 : 4;
  if (dna.keyAssumptions.length > 0) {
    lines.push("- Key assumptions:");
    for (const a of dna.keyAssumptions.slice(0, assumptionCap)) {
      lines.push(`  - ${a}`);
    }
  }
  const vf = dna.valuationFramework;
  if (vf) {
    lines.push(
      `- Valuation framework: ${vf.method || "—"} / ${vf.targetMultiple || "—"}`,
    );
    if (vf.bridgeNotes && vf.bridgeNotes.length > 0) {
      for (const note of vf.bridgeNotes.slice(0, 2)) {
        lines.push(`  - ${note}`);
      }
    }
  }

  const checkpoints =
    thesisCheckpoints && thesisCheckpoints.length > 0
      ? thesisCheckpoints
      : dna.thesisCheckpoints.map((cp) => ({
          id: cp.id,
          label: cp.label,
          expectedDirection: cp.expectedDirection,
          rationale: "",
          sources: [],
        }));

  lines.push("");
  lines.push("# 4. Thesis checkpoints to test (use checkpoint ids in `thesisCheckpointId`)");
  if (checkpoints.length === 0) {
    lines.push("_No structured checkpoints provided. Use null for thesisCheckpointId._");
  } else {
    for (const c of checkpoints.slice(0, 5)) {
      lines.push(
        `- ${c.id}: ${c.label} (expected direction: ${c.expectedDirection})`,
      );
    }
  }

  // Phase 6A: memo-specific anchor for this pass. Rendered only when the
  // request carries both a MemoUnderstanding digest AND a non-empty list
  // of pass-specific research tasks (selected client-side via
  // selectTasksForPass). When this block is present, research findings
  // MUST tie back to memo-specific questions instead of generic company
  // coverage.
  if (
    req.memoUnderstandingDigest &&
    req.passMemoTasks &&
    req.passMemoTasks.length > 0
  ) {
    appendMemoSpecificBlock(
      lines,
      req.memoUnderstandingDigest,
      req.passMemoTasks,
    );
  }

  lines.push("");
  lines.push("# 5. Output requirements");
  lines.push(
    "- Use web_search to find primary sources for the SCOPE of THIS pass only.",
  );
  lines.push(
    "- Quote URLs verbatim — do not paraphrase or rewrite them.",
  );
  lines.push(
    "- Set `tier` on EVERY source (official / company / exchange / transcript / press / market_data / other).",
  );
  lines.push(
    "- Every finding with impact ≠ neutral must carry at least one source with a working url.",
  );
  lines.push(
    "- If your only sources are press / market_data / other, set impact to `watch` — the server will downgrade otherwise.",
  );
  lines.push(
    "- Findings emitted by THIS pass should align with the scope block at the top of the system prompt. Do NOT try to cover OTHER passes' scopes — the orchestrator will combine you with five focused siblings.",
  );
  lines.push(
    "- Emit a single JSON object that matches the schema. No prose outside the JSON.",
  );

  return lines.join("\n");
}

function appendMemoSpecificBlock(
  lines: string[],
  digest: MemoUnderstandingDigest,
  tasks: MemoUnderstandingResearchTask[],
): void {
  lines.push("");
  lines.push("# Memo-specific anchor for this pass");
  lines.push(
    `The user's original memo specifically believed: ${digest.oneLineSummary}`,
  );
  if (digest.recommendation) {
    const target = digest.targetPrice ? ` · target ${digest.targetPrice}` : "";
    lines.push(`Original recommendation: ${digest.recommendation}${target}`);
  }
  if (digest.valuation.method || digest.valuation.targetMultiple) {
    const method = digest.valuation.method ?? "—";
    const multiple = digest.valuation.targetMultiple ?? "—";
    const eps = digest.valuation.impliedEPS
      ? ` · EPS basis ${digest.valuation.impliedEPS}`
      : "";
    lines.push(`Original valuation anchor: ${method} / ${multiple}${eps}`);
  }
  if (digest.thesisPillars.length > 0) {
    lines.push("Thesis pillars this pass should check:");
    for (const p of digest.thesisPillars) {
      lines.push(`- [${p.researchPriority}] ${p.label}`);
    }
  }
  if (digest.flaggedDetails.length > 0) {
    lines.push("Flagged details this pass should specifically update:");
    for (const f of digest.flaggedDetails) {
      lines.push(
        `- [${f.category} · ${f.importance}] ${f.label} — ${f.whyItMatters}`,
      );
    }
  }
  lines.push("Research questions this pass must answer:");
  for (const t of tasks) {
    lines.push(`- ${t.question}  (anchored on: ${t.memoAnchor})`);
  }
  lines.push("For each finding you emit:");
  lines.push(
    "- set `thesisCheckpointId` when applicable (existing rule);",
  );
  lines.push(
    "- set `linkedFlagId` to the flagged-detail id if the finding directly updates that flag;",
  );
  lines.push(
    "- set `linkedResearchTaskId` to the task id if the finding answers a queued question.",
  );
}

function formatAliases(aliases: ResearchPassCompanyAliases): string[] {
  const out: string[] = [];
  out.push(`Long name: ${aliases.longName}`);
  if (aliases.shortName && aliases.shortName !== aliases.longName) {
    out.push(`Short name: ${aliases.shortName}`);
  }
  if (aliases.informalName && aliases.informalName !== aliases.shortName) {
    out.push(`Informal name: ${aliases.informalName}`);
  }
  if (aliases.ticker) out.push(`Ticker: ${aliases.ticker}`);
  if (aliases.exchangeTicker) {
    out.push(`Exchange ticker: ${aliases.exchangeTicker}`);
  }
  if (
    aliases.exchangeTickerAlt &&
    aliases.exchangeTickerAlt !== aliases.exchangeTicker
  ) {
    out.push(`Exchange ticker (alt): ${aliases.exchangeTickerAlt}`);
  }
  if (aliases.ric) out.push(`RIC: ${aliases.ric}`);
  return out;
}
