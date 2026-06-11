import type {
  CanonicalSectionId,
  FollowUpMemo,
  MemoSection,
  ResearchFinding,
  ResearchFindings,
  SourceReference,
} from "@shared/types";

// Phase 5C / Phase 6B: deterministic, no-LLM fallback memo. Built from
// MemoDNA + ResearchFindings when the OpenAI memo call fails (timeout /
// parse / rate-limit / provider error). Same invariants as before, ported
// to the 6-core-section + 3-supplementary-panel restructured memo.

const FALLBACK_MANUAL_CHECK =
  "Compact fallback generated locally from research findings; OpenAI memo generation timed out. Human analyst sign-off required.";

const FINAL_ACTION_CAVEAT =
  "Note: Draft for research support — not investment advice; analyst sign-off required.";

const SHAREHOLDING_KEYWORDS = /(shareholding|promoter|pledge|fii\b|dii\b|institutional|mutual fund|insider|qip\b|preferential|warrant|rights issue|buyback|allotment)/i;

const CORPORATE_EVENT_KEYWORDS = /(acquisition|m&a\b|merger|divest|capex|fund-raise|fundraise|qip\b|debenture|refinanc|buyback|dividend|cfo\b|auditor|kmp\b|board\b|resign|appoint|pivot|litigation|regulatory action)/i;

const INDUSTRY_KEYWORDS = /(regulat|policy|demand|pricing|competit|disrupt|ai\b|llm\b|industry|sector|substitut|commoditi[sz]|customer concentration)/i;

const VALUATION_KEYWORDS = /(valuation|multiple|p\/e|price target|target price|peer|p\/b|ev\/ebitda)/i;

const EARNINGS_KEYWORDS = /(eps|earnings|pat|profit|margin|guidance)/i;

function matches(f: ResearchFinding, re: RegExp): boolean {
  return (
    re.test(f.title) || re.test(f.summary) || re.test(f.relevance)
  );
}

export interface BuildFallbackMemoInput {
  project: { id: string; ticker?: string; companyName: string };
  research: ResearchFindings;
  generatedAt: string;
}

export function buildFallbackMemo(input: BuildFallbackMemoInput): FollowUpMemo {
  const { project, research, generatedAt } = input;
  const byId = new Map(research.findings.map((f) => [f.id, f]));

  // ---------- CORE MEMO (6) ----------

  const heldFindings = research.positiveDevelopments
    .map((id) => byId.get(id))
    .filter((f): f is ResearchFinding => Boolean(f));
  const brokeFindings = research.negativeDevelopments
    .map((id) => byId.get(id))
    .filter((f): f is ResearchFinding => Boolean(f));
  const watchFindings = research.neutralOrWatch
    .map((id) => byId.get(id))
    .filter((f): f is ResearchFinding => Boolean(f));

  const valuationFindings = research.findings.filter(
    (f) =>
      f.category === "valuation" || f.category === "peers" || matches(f, VALUATION_KEYWORDS),
  );
  const financialsFindings = research.findings.filter(
    (f) => f.category === "financials" || f.category === "guidance",
  );
  const shareholdingFindings = research.findings.filter(
    (f) =>
      (f.category === "filings" && matches(f, SHAREHOLDING_KEYWORDS)) ||
      matches(f, SHAREHOLDING_KEYWORDS),
  );
  const corporateEventFindings = research.findings.filter(
    (f) =>
      matches(f, CORPORATE_EVENT_KEYWORDS) &&
      !matches(f, SHAREHOLDING_KEYWORDS),
  );
  const industryFindings = research.findings.filter(
    (f) =>
      f.category === "macro" ||
      f.category === "ai_tech_risk" ||
      f.category === "peers" ||
      matches(f, INDUSTRY_KEYWORDS),
  );

  const sec_thesis_scorecard = makeSection(
    "sec_thesis_scorecard",
    "Memo vs Reality Scorecard",
    valuationFindings.length > 0 || financialsFindings.length > 0
      ? "Quantitative re-test of the original memo against the latest reported numbers and market price. Detail in the supplementary panels below."
      : "Quantitative re-test could not be built — no source-anchored financials or valuation findings surfaced.",
    [...valuationFindings, ...financialsFindings].slice(0, 3).map(findingBullet),
    [...valuationFindings, ...financialsFindings],
  );

  const sec_what_changed = makeSection(
    "sec_what_changed",
    "What Changed — Industry · Company · Financials",
    [...heldFindings, ...brokeFindings, ...watchFindings].length > 0
      ? "Net read across industry, company and financial findings; thesis judgement based on the balance of positive vs negative developments."
      : "No directional developments surfaced in research; thesis judgement deferred.",
    [
      industryFindings.length > 0
        ? `Industry: ${industryFindings[0].title}`
        : "Industry: no notable change surfaced.",
      corporateEventFindings.length > 0
        ? `Company: ${corporateEventFindings[0].title}`
        : "Company: no notable change surfaced.",
      financialsFindings.length > 0
        ? `Financials: ${financialsFindings[0].title}`
        : "Financials: no notable change surfaced.",
    ],
    [
      ...industryFindings.slice(0, 1),
      ...corporateEventFindings.slice(0, 1),
      ...financialsFindings.slice(0, 1),
    ],
  );

  const sec_shareholding = makeSection(
    "sec_shareholding",
    "Shareholding & Ownership Changes",
    shareholdingFindings.length > 0
      ? "Latest shareholding-pattern read from exchange filings; fund-level detail surfaced where the source disclosed it."
      : "Fund-level shareholding detail not surfaced in this run — needs manual lookup of the latest shareholding-pattern filing.",
    shareholdingFindings.slice(0, 3).map(findingBullet),
    shareholdingFindings,
  );

  const sec_industry_regulatory = makeSection(
    "sec_industry_regulatory",
    "Industry & Regulatory Developments",
    industryFindings.length > 0
      ? "Industry, regulatory and AI/tech-risk developments since the memo."
      : "No material industry or regulatory developments surfaced in research.",
    industryFindings.slice(0, 3).map(findingBullet),
    industryFindings,
  );

  const sec_corporate_events = makeSection(
    "sec_corporate_events",
    "Corporate Events (Last 12 Months)",
    corporateEventFindings.length > 0
      ? "Notable company-specific events in the trailing twelve months."
      : "No material corporate events surfaced in research.",
    corporateEventFindings.slice(0, 3).map(findingBullet),
    corporateEventFindings,
  );

  const whyBullets = [
    ...brokeFindings.slice(0, 2).map((f) => `Concern: ${f.title}`),
    ...watchFindings.slice(0, 1).map((f) => `Watch: ${f.title}`),
  ];
  const triggers = research.unresolvedQuestions.slice(0, 3);
  const finalActionBody = [
    "Provisional action: WATCH",
    "Classification: Mixed but monitorable",
    "Why:",
    ...(whyBullets.length > 0
      ? whyBullets.map((b) => `- ${b}`)
      : ["- Compact fallback path — primary model output unavailable."]),
    "What would change the call:",
    "- Positive: Successful re-run of the full memo generation with research findings",
    "- Negative: Persistent generation failures or material new negative findings",
    "Top 3 to monitor:",
    ...(triggers.length > 0
      ? triggers.map((t) => `- ${t}`)
      : ["- Margin & synergy delivery", "- Balance-sheet / leverage trajectory", "- Governance and KMP stability"]),
    "",
    FINAL_ACTION_CAVEAT,
  ].join("\n");
  const sec_investment_action = makeSection(
    "sec_investment_action",
    "Updated Investment View",
    finalActionBody,
    [],
    [],
  );

  // ---------- SUPPLEMENTARY (3) ----------

  const sup_valuation_detail = makeSection(
    "sup_valuation_detail",
    "Valuation Detail · Then vs Now",
    valuationFindings.length > 0
      ? "Valuation findings from research; quantitative bridge to be assembled by a human analyst pending source-anchored numbers."
      : "No valuation findings surfaced in research.",
    valuationFindings.slice(0, 3).map(findingBullet),
    valuationFindings,
  );

  const epsBridgeFindings = research.findings.filter(
    (f) =>
      f.category === "financials" ||
      f.category === "guidance" ||
      matches(f, EARNINGS_KEYWORDS),
  );
  const sup_eps_bridge = makeSection(
    "sup_eps_bridge",
    "EPS Credibility Bridge",
    epsBridgeFindings.length > 0
      ? "EPS-relevant findings from research; full bridge requires source-anchored prior and revised estimates from a human analyst."
      : "No EPS-relevant findings surfaced in research.",
    epsBridgeFindings.slice(0, 3).map(findingBullet),
    epsBridgeFindings,
  );

  const sup_financials_actuals = makeSection(
    "sup_financials_actuals",
    "Memo Forecasts vs Reported Financials",
    financialsFindings.length > 0
      ? "Financials and guidance findings from research; full memo-vs-actual table requires human alignment with the original memo's stated forecasts."
      : "No financials or guidance findings surfaced in research.",
    financialsFindings.slice(0, 3).map(findingBullet),
    financialsFindings,
  );

  const sections: MemoSection[] = [
    sec_thesis_scorecard,
    sec_what_changed,
    sec_shareholding,
    sec_industry_regulatory,
    sec_corporate_events,
    sec_investment_action,
  ];

  const supplementaryPanels: MemoSection[] = [
    sup_valuation_detail,
    sup_eps_bridge,
    sup_financials_actuals,
  ];

  return {
    projectId: project.id,
    title: `Fallback Follow-up Memo — ${project.companyName}`,
    generatedAt,
    sections,
    supplementaryPanels,
    isDemo: false,
    manualChecksRemaining: [FALLBACK_MANUAL_CHECK],
    sourceMode: "deterministic",
  };
}

function findingBullet(f: ResearchFinding): string {
  const tag =
    f.impact === "positive"
      ? "Positive"
      : f.impact === "negative"
        ? "Negative"
        : f.impact === "watch"
          ? "Watch"
          : "Neutral";
  return `${tag} · ${f.title} — ${f.summary}`;
}

function makeSection(
  id: CanonicalSectionId,
  title: string,
  body: string,
  bullets: string[],
  contributingFindings: ResearchFinding[],
): MemoSection {
  const sources: SourceReference[] = [];
  for (const f of contributingFindings) {
    for (let i = 0; i < f.sources.length; i++) {
      const s = f.sources[i];
      const documentId = `research:${f.id}:${i}`;
      const sourceLabel = (s.title && s.title.trim()) || s.url || "research source";
      sources.push({
        documentId,
        quote: `Finding: ${f.title}. Source: ${sourceLabel}`,
      });
    }
  }
  return {
    id,
    title,
    body,
    bullets,
    summary: body,
    signal: "neutral",
    confidence: "low",
    sources,
  };
}
