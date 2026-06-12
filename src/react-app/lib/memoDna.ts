import type { MemoDNA, ThesisCheckpoint } from "@shared/types";
import {
  CATEGORY_LABEL,
  KEYWORDS,
  detectSector,
  type KeywordEntry,
} from "./keywords";
import { dedupe, splitParagraphs, splitSentences, wordCount } from "./text";

interface BuildOptions {
  text: string;
  filename: string;
}

export function buildMemoDnaFromText({ text, filename }: BuildOptions): MemoDNA {
  const paragraphs = splitParagraphs(text);
  const sentences = splitSentences(text);
  const lower = text.toLowerCase();

  const hits = scoreKeywords(text);
  const company = detectCompanyFromTextDetailed(text, filename).company;
  const sector = detectSector(text);

  const originalThesis = detectThesis(text, paragraphs, sentences, company);
  const keyAssumptions = detectAssumptions(text, sentences);
  const valuationFramework = detectValuation(text, sentences);
  const analyticalFramework = buildAnalyticalFramework(hits);
  const openQuestions = detectOpenQuestions(text, sentences);
  const riskChecklist = detectRisks(text, sentences, hits);
  const thesisCheckpoints = buildCheckpoints(keyAssumptions, valuationFramework, hits);
  const styleTone = buildStyleTone(sentences, lower);

  const projectId = `proj_extracted_${shortHash(filename)}`;

  return {
    projectId,
    originalThesis: originalThesis ||
      `Heuristic v0 could not lock onto an explicit thesis statement in ${filename}. The follow-up memo will fall back to a default thesis frame until LLM extraction is wired in Phase 3.`,
    keyAssumptions:
      keyAssumptions.length > 0
        ? keyAssumptions
        : ["No explicit assumptions detected. Heuristic v0 looks for `we expect / assume / forecast` patterns and bullets under an Assumptions heading."],
    styleTone,
    analyticalFramework:
      analyticalFramework.length > 0
        ? analyticalFramework
        : [
            "No buy-side framework keywords detected. Add SaaS / Rule of 40 / valuation language to the source memo to improve extraction.",
          ],
    valuationFramework,
    openQuestions:
      openQuestions.length > 0
        ? openQuestions
        : [
            sector
              ? `What is the credible ${sector.toLowerCase()} unit economics path over the next 8 quarters?`
              : "What unit economics and capital allocation signals should we re-test in the next quarter?",
          ],
    riskChecklist:
      riskChecklist.length > 0
        ? riskChecklist
        : [
            {
              category: "Heuristic v0 placeholder",
              risks: [
                "No explicit risk language detected. Add a Risks or Key risks section to the source memo for richer extraction.",
              ],
            },
          ],
    thesisCheckpoints,
    isDemo: false,
  };
}

// ----- pieces -----

export interface CompanyDetectionResult {
  company?: string;
  ticker?: string;
  confidence: "high" | "medium" | "low";
  reason: string;
}

// Back-compat thin wrapper — many callers only want the string.
export function detectCompanyFromText(
  text: string,
  filename: string,
): string | undefined {
  return detectCompanyFromTextDetailed(text, filename).company;
}

// Phase 5C: broker-aware, position-weighted company detection. The old
// detector picked whichever ALL-CAPS token or title-case phrase repeated
// most often, which made broker names ("JM Financial", "Morgan Stanley")
// beat the actually-covered company on broker notes. The new detector:
//   1. Pulls a ticker from NSE/BSE/Bloomberg/Ticker patterns.
//   2. Builds a candidate pool of title-case phrases — including
//      "<Name> Ltd/Limited/Inc/India" forms so "Havells India Ltd"
//      beats bare "Havells".
//   3. Filters candidates through token-subsequence broker exclusion.
//      "JM" is excluded (subseq of "jm financial"); "ICICI Bank" is
//      NOT excluded (icici-bank tokens are not a subseq of any broker
//      canonical, nor vice-versa); "ICICI Securities" is excluded.
//   4. Scores survivors with cover/body, suffix, reco-line, key-data,
//      and ticker-line bonuses.
//   5. Promotes the strongest survivor on the ticker's line if scores
//      are otherwise weak.
//   6. Falls back to the filename stem, but only after running the same
//      broker exclusion + a generic-stopword filter against the stem
//      tokens (so "Q4 FY26 broker memo.pdf" doesn't fabricate a
//      company name).
const COVER_CHAR_BUDGET = 1500;

const BROKER_CANONICALS: readonly string[] = [
  "jm financial institutional securities",
  "jm financial",
  "morgan stanley",
  "jefferies",
  "goldman sachs",
  "jp morgan",
  "jpm",
  "jpmorgan",
  "ubs",
  "citi",
  "citigroup",
  "clsa",
  "motilal oswal",
  "mosl",
  "icici securities",
  "icicidirect",
  "hdfc securities",
  "kotak institutional equities",
  "kotak securities",
  "kotak",
  "axis capital",
  "nuvama",
  "edelweiss",
  "iifl",
  "emkay",
  "antique stock broking",
  "antique",
  "systematix",
  "ambit",
  "sharekhan",
  "anand rathi",
  "religare",
  "spark capital",
  "centrum",
  "elara",
  "bnp paribas",
  "macquarie",
  "bernstein",
  "bofa",
  "bank of america",
  "credit suisse",
  "deutsche bank",
  "beas capital",
  "beas capital management",
  "incred capital",
  "incred research",
  "incred",
  "phillipcapital",
  "phillip capital",
  "investec",
  "ventura securities",
  "ventura",
  "monarch networth",
  "monarch",
  "yes securities",
  "icici direct",
  "geojit",
  "prabhudas lilladher",
  "plindia",
  "sharekhan limited",
  "daiwa",
  "nomura",
  "sbicap",
];

const BROKER_CANONICAL_TOKENS: readonly string[][] = BROKER_CANONICALS.map(
  (b) => b.split(/\s+/),
);

const TICKER_REJECT = new Set([
  "IN",
  "EQUITY",
  "INR",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CNY",
  "HKD",
  "JM",
  "JPM",
  "UBS",
  "MOSL",
  "CLSA",
  "IIFL",
  "HDFC",
  "ICICI",
  "BOFA",
]);

const FILENAME_GENERIC_STOPWORDS = new Set([
  "memo",
  "research",
  "update",
  "report",
  "pdf",
  "document",
  "note",
  "notes",
  "cover",
  "final",
  "draft",
  "output",
  "investment",
  "company",
  "equity",
  "result",
  "quarterly",
  "annual",
  "untitled",
  "download",
  "file",
  "q1",
  "q2",
  "q3",
  "q4",
  "fy",
]);

// Single-token leads that almost always indicate a fragment rather than
// the actual company name. "Bank Ltd" / "Group Ltd" / "Holdings" — these
// pop out of the title-case regex when scanning broker notes, and beat
// the true company on score because every legit name ends with the same
// suffix. Filtering them out before scoring keeps "ICICI Bank Ltd" from
// being dethroned by "Bank Ltd".
const NOUN_FRAGMENT_LEADS = new Set([
  "bank",
  "corp",
  "corporation",
  "group",
  "ltd",
  "limited",
  "inc",
  "company",
  "holdings",
  "industries",
  "limitedresearch",
]);

export function detectCompanyFromTextDetailed(
  text: string,
  filename: string,
): CompanyDetectionResult {
  const safeText = typeof text === "string" ? text : "";
  const safeFilename = typeof filename === "string" ? filename : "";

  const ticker = extractTicker(safeText);

  const cover = safeText.slice(0, COVER_CHAR_BUDGET);
  const body = safeText.slice(COVER_CHAR_BUDGET);

  // Candidate pool: ordinary title-case phrases + "<X> Ltd/Limited/Inc/India" forms.
  const phraseSet = new Set<string>();
  for (const m of safeText.match(
    /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g,
  ) ?? []) {
    phraseSet.add(m);
  }
  // Phase 6G.1: camelCase / PascalCase tokens like "RateGain",
  // "BlackRock", "SAP", "BAT". The original title-case regex required
  // a lowercase letter between each capital ("Rate Gain" with a space),
  // so RateGain only contributed "RateGain" as a single-token candidate
  // that no later pass picked up.
  const mixedCaseRe = /\b([A-Z][a-z]+[A-Z][A-Za-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g;
  for (const m of safeText.matchAll(mixedCaseRe)) {
    if (m[1]) phraseSet.add(m[1]);
  }
  // matchAll → capture both the full suffixed form ("ICICI Bank Ltd") and
  // the unsuffixed name ("ICICI Bank") so the scorer can compare. The
  // suffixed form earns the +2 corporate-suffix bonus.
  const ltdRe = /\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})\s+(?:Ltd|Limited|Inc|India)\b/g;
  for (const m of safeText.matchAll(ltdRe)) {
    if (m[0]) phraseSet.add(m[0]);
    if (m[1]) phraseSet.add(m[1]);
  }
  const candidates = Array.from(phraseSet).filter(
    (c) =>
      !isBrokerPhrase(c) &&
      !isGenericPhrase(c) &&
      !isNounFragment(c),
  );

  const tickerLine = ticker ? findTickerLine(safeText, ticker) : "";

  const scored = candidates
    .map((c) => {
      const score = scoreCandidate(c, cover, body, tickerLine);
      return { candidate: c, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  // Prefer phrases that explicitly carry a corporate-name suffix.
  const top = scored[0];
  const runnerUp = scored[1];

  const brokersDetected = Array.from(phraseSet).filter((c) => isBrokerPhrase(c));
  const brokerNote =
    brokersDetected.length > 0
      ? ` ${brokersDetected
          .slice(0, 2)
          .map((b) => `'${b}'`)
          .join(", ")} excluded as broker.`
      : "";

  if (top && top.score >= 12 && (!runnerUp || top.score - runnerUp.score >= 6)) {
    const lead = runnerUp ? top.score - runnerUp.score : top.score;
    return {
      company: top.candidate,
      ticker,
      confidence: "high",
      reason: `'${top.candidate}' scored ${top.score} (lead ${lead}).${brokerNote}`,
    };
  }
  if (top && ticker && tickerLine && tokenSubseq(tokenize(top.candidate), tokenize(tickerLine))) {
    return {
      company: top.candidate,
      ticker,
      confidence: "high",
      reason: `'${top.candidate}' scored ${top.score}; appears on ticker line for ${ticker}.${brokerNote}`,
    };
  }
  if (top && top.score >= 6) {
    return {
      company: top.candidate,
      ticker,
      confidence: "medium",
      reason: `'${top.candidate}' scored ${top.score}.${brokerNote}`,
    };
  }
  if (top) {
    return {
      company: top.candidate,
      ticker,
      confidence: "low",
      reason: `'${top.candidate}' scored only ${top.score} — manual confirmation recommended.${brokerNote}`,
    };
  }

  // Fallback to filename stem with safety filters.
  const stem = safeFilename
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (
    stem.length >= 3 &&
    !isBrokerPhrase(stem) &&
    !isGenericPhrase(stem)
  ) {
    return {
      company: stem,
      ticker,
      confidence: "low",
      reason: `No strong in-text candidate; falling back to filename stem '${stem}'.${brokerNote}`,
    };
  }
  return {
    company: undefined,
    ticker,
    confidence: "low",
    reason: `Filename fallback rejected (broker/generic/too short); manual confirmation needed.${brokerNote}`,
  };
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

// Contiguous token-level sub-sequence test: are `a`'s tokens a window
// inside `b`'s tokens?
function tokenSubseq(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  if (a.length > b.length) return false;
  outer: for (let i = 0; i + a.length <= b.length; i++) {
    for (let j = 0; j < a.length; j++) {
      if (a[j] !== b[i + j]) continue outer;
    }
    return true;
  }
  return false;
}

// Generic broker-suffix tokens: any 2–3 token candidate whose TRAILING
// token reads as a research-firm suffix ("X Capital", "X Securities",
// "X Research", "X Institutional", "X Brokerage") is treated as a
// broker even when not in the canonical list. This catches the long
// tail of niche research houses (Beas Capital, Plutus Capital,
// Anand Securities, etc.) without needing to enumerate every one.
const BROKER_SUFFIX_TOKENS = new Set([
  "capital",
  "securities",
  "research",
  "institutional",
  "brokerage",
  "broking",
  "stockbroking",
  "advisors",
  "advisory",
  "asset",
  "wealth",
  "investments",
  "investment",
]);

function isBrokerPhrase(candidate: string): boolean {
  const toks = tokenize(candidate);
  if (toks.length === 0) return false;
  for (const broker of BROKER_CANONICAL_TOKENS) {
    if (toks.length === broker.length) {
      let eq = true;
      for (let i = 0; i < toks.length; i++) {
        if (toks[i] !== broker[i]) {
          eq = false;
          break;
        }
      }
      if (eq) return true;
    }
    if (tokenSubseq(toks, broker)) return true;
    if (tokenSubseq(broker, toks)) return true;
  }
  // Structural suffix check — drops the broker even if it's not in the
  // canonical list. Restricted to short (2-3 token) candidates so we
  // never knock out a real company name that just happens to contain
  // the word "capital" deep inside it.
  if (toks.length >= 2 && toks.length <= 3) {
    const last = toks[toks.length - 1];
    if (BROKER_SUFFIX_TOKENS.has(last)) return true;
  }
  return false;
}

function isGenericPhrase(candidate: string): boolean {
  const toks = tokenize(candidate);
  if (toks.length === 0) return true;
  // All tokens stopwords → generic. (Single-token "Memo" → generic.)
  return toks.every((t) => FILENAME_GENERIC_STOPWORDS.has(t));
}

function isNounFragment(candidate: string): boolean {
  const toks = tokenize(candidate);
  if (toks.length === 0) return false;
  return NOUN_FRAGMENT_LEADS.has(toks[0]);
}

function countMatches(haystack: string, needle: string): number {
  if (!needle || !haystack) return 0;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b`, "g");
  let count = 0;
  while (re.exec(haystack) !== null) count += 1;
  return count;
}

const RECO_RE = /\b(?:BUY|ADD|HOLD|REDUCE|SELL|Target\s+Price|Reco|Recommendation)\b/i;
const KEY_DATA_RE = /\b(?:Key\s+Data|Company\s+Data|Stock\s+Data)\b/i;

function scoreCandidate(
  candidate: string,
  cover: string,
  body: string,
  tickerLine: string,
): number {
  const coverCount = countMatches(cover, candidate);
  const bodyCount = countMatches(body, candidate);
  if (coverCount === 0 && bodyCount === 0) return 0;

  let score = bodyCount * 2 + coverCount * 1;

  if (/\b(?:Ltd|Limited|Inc|India)\b/.test(candidate)) score += 2;

  // Reco-line proximity: scan for any window of 80 chars containing
  // BOTH the candidate and a reco token.
  const fullText = cover + body;
  const re = new RegExp(
    `\\b${candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
    "g",
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(fullText)) !== null) {
    const start = Math.max(0, m.index - 80);
    const end = Math.min(fullText.length, m.index + candidate.length + 80);
    const window = fullText.slice(start, end);
    if (RECO_RE.test(window)) {
      score += 3;
      break;
    }
  }

  if (KEY_DATA_RE.test(cover) && countMatches(cover, candidate) > 0) {
    score += 2;
  }

  if (tickerLine && tokenSubseq(tokenize(candidate), tokenize(tickerLine))) {
    score += 3;
  }

  return score;
}

const TICKER_PATTERNS: readonly RegExp[] = [
  /\bNSE\s*[:-]\s*([A-Z][A-Z0-9&-]{1,11})\b/,
  /\bBSE\s*[:-]\s*([A-Z0-9][A-Z0-9&-]{1,11})\b/,
  /\b([A-Z]{2,10})\s+IN\s+Equity\b/,
  /\b([A-Z]{2,10})\s+IN\b/,
  /\b(?:Ticker|Symbol|BSE\s*Code|NSE\s*Code|Code)\s*[:-]\s*([A-Z0-9&-]{2,12})\b/i,
];

function extractTicker(text: string): string | undefined {
  for (const re of TICKER_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const sym = m[1]?.toUpperCase();
    if (!sym) continue;
    if (TICKER_REJECT.has(sym)) continue;
    return sym;
  }
  return undefined;
}

function findTickerLine(text: string, ticker: string): string {
  if (!ticker) return "";
  const lines = text.split(/\n/);
  for (const ln of lines) {
    if (ln.includes(ticker)) return ln;
  }
  return "";
}

const THESIS_HEADING =
  /^(?:\s*#+\s*)?(?:investment\s+thesis|thesis|summary|investment\s+case|view|our\s+view|recommendation)\s*[:-]?\s*$/im;

function detectThesis(
  text: string,
  paragraphs: string[],
  sentences: string[],
  company?: string,
): string {
  // 1. Heading-anchored thesis
  const lines = text.split(/\n+/);
  for (let i = 0; i < lines.length; i++) {
    if (THESIS_HEADING.test(lines[i])) {
      // Take the next non-empty paragraph
      for (let j = i + 1; j < lines.length; j++) {
        const candidate = lines[j].trim();
        if (candidate.length > 60) return candidate.slice(0, 800);
      }
    }
  }

  // 2. First substantive paragraph (>120 chars, contains a thesis verb)
  const thesisVerbs = /\b(compound|disrupt|consolidat|expand|cross-?sell|drag|inflect|re-?rate|conviction)/i;
  const first = paragraphs.find((p) => p.length > 120 && thesisVerbs.test(p));
  if (first) return first.slice(0, 800);

  // 3. First 2-3 sentences if they look like a thesis
  if (sentences.length >= 2) {
    const lead = sentences.slice(0, 3).join(" ");
    if (lead.length > 80) return lead.slice(0, 800);
  }

  if (company) {
    return `${company} thesis statement could not be isolated by heuristic v0. Real LLM extraction in Phase 3 will identify the thesis paragraph directly.`;
  }
  return "";
}

const ASSUMPTION_PATTERNS = [
  /\bwe (?:expect|assume|believe|model|forecast|see|estimate)\b/i,
  /\b(?:should|will|expected to|projected to)\b.*\b(?:grow|expand|reach|cross|hit)\b/i,
  /\bmanagement (?:expects|guides|believes|targets)\b/i,
  /\btarget(?:s|ing)?\b.*\b\d/i,
];

function detectAssumptions(text: string, sentences: string[]): string[] {
  const hits: string[] = [];

  // Heading-anchored bullets
  const headingBullets = extractBulletsUnderHeading(text, [
    "key assumptions",
    "assumptions",
    "key drivers",
    "key levers",
  ]);
  hits.push(...headingBullets);

  // Sentence patterns
  for (const s of sentences) {
    if (s.length < 40 || s.length > 280) continue;
    if (ASSUMPTION_PATTERNS.some((p) => p.test(s))) hits.push(s);
  }

  return dedupe(hits.map((s) => s.replace(/^\W+/, "").trim())).slice(0, 8);
}

function detectValuation(
  text: string,
  sentences: string[],
): MemoDNA["valuationFramework"] {
  const method = pickFirstMatch(text, [
    /\bDCF\b/,
    /\bEV\/EBITDA\b/,
    /\bEV\/Sales\b/,
    /\bP\/E\b/,
    /\bsum[-\s]of[-\s]parts\b/i,
    /\breplacement value\b/i,
  ]);

  // Target multiple pattern
  const multipleMatch =
    text.match(/(\d+(?:\.\d+)?)\s*[xX]\s*(?:FY\d{2,4}\s+)?(?:EPS|EBITDA|Sales|forward earnings|revenue)/) ||
    text.match(/\b(\d+(?:\.\d+)?)\s*[xX]\b/);
  const targetMultiple = multipleMatch?.[0]?.trim();

  // Bridge notes — sentences containing valuation cues
  const valuationCues = /\b(fair value|target price|target multiple|peer multiple|upside|downside|comp|valuation bridge|INR|USD|EUR|\$\d)/i;
  const bridgeNotes = dedupe(
    sentences.filter((s) => s.length < 320 && valuationCues.test(s) && /\d/.test(s)),
  ).slice(0, 4);

  return {
    method: method ?? "No explicit valuation method detected (Heuristic v0)",
    targetMultiple:
      targetMultiple ?? "Not detected — add `Nx FYxx EPS` style phrasing",
    bridgeNotes:
      bridgeNotes.length > 0
        ? bridgeNotes
        : ["Heuristic v0 did not find valuation bridge sentences. The follow-up memo will fall back to peer-multiple framing."],
  };
}

function buildAnalyticalFramework(hits: KeywordHit[]): string[] {
  // Group by category, take top 6 categories
  const byCategory = new Map<KeywordEntry["category"], number>();
  for (const h of hits) {
    byCategory.set(h.category, (byCategory.get(h.category) ?? 0) + h.score);
  }
  const top = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);

  return top.map(([category, score]) => {
    const hitsForCategory = hits.filter((h) => h.category === category).slice(0, 3);
    const phrases = hitsForCategory.map((h) => h.phrase).join(", ");
    return `${CATEGORY_LABEL[category]} — signal weight ${score} · phrases: ${phrases}`;
  });
}

function detectOpenQuestions(text: string, sentences: string[]): string[] {
  const questions: string[] = [];

  // Bullets under "Open questions" / "To watch" / "What we are watching"
  const headingBullets = extractBulletsUnderHeading(text, [
    "open questions",
    "to watch",
    "what we are watching",
    "questions to retest",
  ]);
  questions.push(...headingBullets);

  // Direct questions
  for (const s of sentences) {
    if (s.endsWith("?") && s.length > 30 && s.length < 240) questions.push(s);
  }

  return dedupe(questions).slice(0, 6);
}

function detectRisks(
  text: string,
  sentences: string[],
  hits: KeywordHit[],
): MemoDNA["riskChecklist"] {
  const business: string[] = [];
  const execution: string[] = [];
  const macro: string[] = [];
  const valuation: string[] = [];

  // Heading-anchored bullets
  const headingBullets = extractBulletsUnderHeading(text, [
    "risks",
    "key risks",
    "what could go wrong",
    "downside risks",
    "risk checklist",
  ]);

  const all = [
    ...headingBullets,
    ...sentences.filter(
      (s) =>
        s.length > 30 &&
        s.length < 280 &&
        /\b(risk|downside|concern|headwind|overhang|threat|disrupt)/i.test(s),
    ),
  ];

  for (const r of dedupe(all)) {
    if (/\b(AI|GenAI|macro|FX|regulatory|geopolitical)\b/i.test(r)) macro.push(r);
    else if (/\b(execution|integration|management|hire|cultural|capital allocation)\b/i.test(r)) execution.push(r);
    else if (/\b(multiple|valuation|de-?rate|premium|comp)\b/i.test(r)) valuation.push(r);
    else business.push(r);
  }

  const out: MemoDNA["riskChecklist"] = [];
  if (business.length) out.push({ category: "Business model risk", risks: business.slice(0, 4) });
  if (execution.length) out.push({ category: "Execution / M&A risk", risks: execution.slice(0, 4) });
  if (macro.length) out.push({ category: "AI / macro risk", risks: macro.slice(0, 4) });
  if (valuation.length) out.push({ category: "Valuation risk", risks: valuation.slice(0, 4) });

  // Add heuristic-detected categories from keyword hits if buckets are empty
  if (out.length === 0 && hits.some((h) => h.category === "ai_macro")) {
    out.push({
      category: "AI / macro risk (keyword-derived)",
      risks: ["AI / macro keywords were detected in the memo but no explicit risk language was attached to them."],
    });
  }
  return out;
}

function buildCheckpoints(
  assumptions: string[],
  valuation: MemoDNA["valuationFramework"],
  hits: KeywordHit[],
): ThesisCheckpoint[] {
  const out: ThesisCheckpoint[] = [];

  assumptions.slice(0, 4).forEach((a, i) => {
    out.push({
      id: `cp_extracted_assumption_${i}`,
      label: condense(a, 70),
      expectedDirection: directionFromSentence(a),
      rationale: a,
      sources: [],
    });
  });

  if (valuation.targetMultiple && !valuation.targetMultiple.startsWith("Not detected")) {
    out.push({
      id: "cp_extracted_valuation",
      label: `Valuation: ${valuation.targetMultiple}`,
      expectedDirection: "up",
      rationale: `Method ${valuation.method}; valuation bridge anchored on ${valuation.targetMultiple}.`,
      sources: [],
    });
  }

  // Backfill with top-scoring category if we have less than 3 checkpoints
  if (out.length < 3 && hits.length > 0) {
    const top = hits[0];
    out.push({
      id: "cp_extracted_signal",
      label: `Signal: ${CATEGORY_LABEL[top.category]}`,
      expectedDirection: "flat",
      rationale: `Heuristic v0 detected ${top.phrase} as the highest-weight buy-side signal in the source memo.`,
      sources: [],
    });
  }

  return out;
}

function directionFromSentence(s: string): "up" | "down" | "flat" {
  if (/\b(grow|expand|accelerat|increase|rise|cross|hit|reach|inflect|re-?rate|upside)\b/i.test(s)) return "up";
  if (/\b(declin|compress|drop|miss|cut|slow|de-?rate|downside)\b/i.test(s)) return "down";
  return "flat";
}

function buildStyleTone(
  sentences: string[],
  lower: string,
): MemoDNA["styleTone"] {
  const totalWords = sentences.reduce((a, s) => a + wordCount(s), 0);
  const avgSentenceLen = sentences.length > 0 ? totalWords / sentences.length : 0;

  const firstPersonMatches = lower.match(/\b(we|our|us)\b/g)?.length ?? 0;
  const firstPersonRatio = totalWords > 0 ? firstPersonMatches / totalWords : 0;

  const hedgeMatches = lower.match(/\b(may|might|could|likely|perhaps|seems|appears|tends to)\b/g)?.length ?? 0;
  const hedgeRatio = totalWords > 0 ? hedgeMatches / totalWords : 0;

  const adjectives: string[] = [];
  if (avgSentenceLen < 20) adjectives.push("concise");
  else if (avgSentenceLen > 30) adjectives.push("dense / paragraph-heavy");

  if (firstPersonRatio > 0.008) adjectives.push("first-person, conviction-led");
  if (firstPersonRatio < 0.002) adjectives.push("third-person / report-style");

  if (hedgeRatio > 0.008) adjectives.push("hedged");
  else adjectives.push("direct");

  if (/\bthesis\b/i.test(lower)) adjectives.push("thesis-driven");
  if (/\bposition size|portfolio weight|conviction\b/i.test(lower)) adjectives.push("position-sizing explicit");
  if (/\bbuy-?side\b/i.test(lower)) adjectives.push("buy-side framing");

  // Pick 3 representative sample sentences
  const sampleCandidates = sentences
    .filter((s) => s.length > 60 && s.length < 220 && /\d/.test(s))
    .slice(0, 6);
  const sampleSentences = sampleCandidates.slice(0, 3);

  return {
    adjectives: adjectives.length > 0 ? adjectives : ["heuristic v0 — limited signal"],
    sampleSentences:
      sampleSentences.length > 0
        ? sampleSentences
        : ["Heuristic v0 could not find numbered, thesis-shaped sentences. Add concrete forecasts for richer voice extraction."],
  };
}

// ----- helpers -----

interface KeywordHit {
  phrase: string;
  category: KeywordEntry["category"];
  score: number;
}

function scoreKeywords(text: string): KeywordHit[] {
  const out: KeywordHit[] = [];
  for (const k of KEYWORDS) {
    const matches = text.match(k.pattern);
    if (matches && matches.length > 0) {
      out.push({ phrase: k.phrase, category: k.category, score: matches.length * k.weight });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

function pickFirstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return undefined;
}

function extractBulletsUnderHeading(text: string, headings: string[]): string[] {
  const lines = text.split(/\n+/);
  const out: string[] = [];
  const headingRegex = new RegExp(
    `^\\s*#?\\s*(?:${headings.join("|")})\\s*[:\\-]?\\s*$`,
    "i",
  );

  for (let i = 0; i < lines.length; i++) {
    if (!headingRegex.test(lines[i])) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const ln = lines[j].trim();
      if (!ln) {
        // continue past one blank line, stop at two
        if (j + 1 < lines.length && !lines[j + 1].trim()) break;
        continue;
      }
      if (/^#+\s/.test(ln) || /^[A-Z][A-Z\s]{6,}$/.test(ln)) break;
      if (/^[-*•·]\s+/.test(ln) || /^\d+[.)]\s+/.test(ln)) {
        out.push(ln.replace(/^[-*•·\d.)\s]+/, "").trim());
      } else if (out.length > 0) {
        break;
      }
    }
  }

  return out.filter((b) => b.length > 10).slice(0, 8);
}

function condense(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  const cut = s.slice(0, maxLen);
  const space = cut.lastIndexOf(" ");
  return (space > maxLen * 0.6 ? cut.slice(0, space) : cut) + "…";
}

function shortHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
