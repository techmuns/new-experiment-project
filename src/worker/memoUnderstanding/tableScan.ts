// Phase 6G: deterministic table scanner for the memo-baseline tier.
//
// Broker memos carry their most thesis-critical numbers in dense
// quarterly tables (segment revenue, YoY growth, EBIT margin, the
// income statement). PDF extraction flattens those tables into long
// label+number runs that the sentence segmenter rejects (>320 chars),
// so the regex NumericClaim extractor never saw them and the baseline
// tier underrepresented exactly the data the thesis hangs on.
//
// This scanner is pure and fabrication-free:
//   - Every value is a VERBATIM numeric token from the text.
//   - Every period is a VERBATIM header token aligned by column count.
//   - Rows that can't be aligned confidently are dropped, not guessed.
//
// Shape of the tables it targets (whitespace-flattened):
//   ... (INR mn) Q3FY24 Q4FY24 FY24 ... Q3FY26 Q3FY26E   ← header run
//   Net Revenue 44,006 54,343 1,85,499 ... 55,734 53,021 ← metric row
//   YoY 7% 12% 10% ... 14% 9%                            ← carry-label row
//   Segment Revenue                                       ← block header
//   Cables & Wires 15,727 17,896 ... 22,411 20,423        ← segment row

export interface TableRowClaim {
  // Row label, e.g. "Cables & Wires", "Net Revenue YoY", "Diluted EPS (INR)".
  label: string;
  // Nearest preceding block header inside the same table, e.g.
  // "Segment Revenue", "YoY Revenue Growth", "EBIT margin".
  blockHint?: string;
  // Latest ACTUAL period column (no E suffix), e.g. "Q3FY26", "FY25".
  period: string;
  // Verbatim value in that column, e.g. "55,734", "9.4%", "(587)".
  value: string;
  // Value in the first estimate (E-suffixed) column after the latest
  // actual, when the header has one. e.g. "53,021" for Q3FY26E.
  estimate?: string;
  estimatePeriod?: string;
  // Verbatim slice of the source row (≤200 chars) for memoEvidence.
  evidence: string;
}

interface Token {
  kind: "period" | "num" | "word";
  text: string;
  start: number;
  end: number;
}

// Period tokens: Q3FY26, 3QFY26, Q3 FY26, FY24, FY26E, FY24A.
const PERIOD_RE =
  /(?:Q[1-4]\s?FY\s?\d{2,4}|[1-4]Q\s?FY\s?\d{2,4}|FY\s?\d{2,4})(?:[AE])?\b/y;
// Numbers: 44,006 · 1,85,499 (Indian grouping) · 9.8% · (877) · -10.2% · 20.3
const NUM_RE = /\(?-?\d{1,3}(?:,\d{2,3})*(?:\.\d+)?\)?%?/y;
// Words: letters plus the punctuation that appears inside row labels.
const WORD_RE = /[A-Za-z&][A-Za-z&().'/%-]*/y;

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    PERIOD_RE.lastIndex = i;
    const pm = PERIOD_RE.exec(text);
    if (pm && pm.index === i) {
      out.push({ kind: "period", text: pm[0].replace(/\s+/g, ""), start: i, end: i + pm[0].length });
      i += pm[0].length;
      continue;
    }
    NUM_RE.lastIndex = i;
    const nm = NUM_RE.exec(text);
    if (nm && nm.index === i) {
      out.push({ kind: "num", text: nm[0], start: i, end: i + nm[0].length });
      i += nm[0].length;
      continue;
    }
    WORD_RE.lastIndex = i;
    const wm = WORD_RE.exec(text);
    if (wm && wm.index === i) {
      out.push({ kind: "word", text: wm[0], start: i, end: i + wm[0].length });
      i += wm[0].length;
      continue;
    }
    i++;
  }
  return out;
}

// Normalize "3QFY26" → "Q3FY26"; strip a trailing A (actual marker).
function normalizePeriod(raw: string): string {
  let p = raw.toUpperCase().replace(/\s+/g, "");
  const m = p.match(/^([1-4])Q(FY\d{2,4})([AE])?$/);
  if (m) p = `Q${m[1]}${m[2]}${m[3] ?? ""}`;
  if (p.endsWith("A")) p = p.slice(0, -1);
  return p;
}

function isEstimatePeriod(p: string): boolean {
  return p.endsWith("E");
}

// Sortable recency: FY26 → 260, Q3FY26 → 263. FY rows rank just above
// their Q4 so annual totals beat quarters of the same year.
function periodRank(p: string): number {
  const base = p.replace(/E$/, "");
  const qm = base.match(/^Q([1-4])FY(\d{2,4})$/);
  if (qm) return parseInt(qm[2].slice(-2), 10) * 10 + parseInt(qm[1], 10);
  const fm = base.match(/^FY(\d{2,4})$/);
  if (fm) return parseInt(fm[1].slice(-2), 10) * 10 + 5;
  return 0;
}

const LABEL_STOPWORDS = /\b(exhibit|source|page|year end|y\/e|appendix)\b/i;
// Carry-labels inherit the previous primary label ("Net Revenue" + "YoY").
// Only labels that are INCOMPLETE alone belong here — "EBITDA margin%"
// is already complete and must NOT get a prefix.
const CARRY_LABEL_RE = /^(yoy|qoq|margin ?%?|% of sales)$/i;
// Block headers between rows (word runs with no numbers).
const BLOCK_HINT_RE =
  /(segment revenue|yoy revenue growth|revenue mix|segment ebit margin|segment ebit|ebit margin|revenue growth)/i;
// When a block-header phrase runs straight into the first row's label
// in the flattened text ("Segment Revenue Havells (ex-Lloyd) 37,540 …"),
// split the phrase off into blockHint.
const BLOCK_PREFIX_RE =
  /^(segment revenue|yoy revenue growth|revenue mix|segment ebit margin|segment ebit|ebit margin|revenue growth)\s+(.+)$/i;

const MIN_HEADER_PERIODS = 4;
const MIN_ROW_NUMS = 3;
const MAX_LABEL_TOKENS = 6;
const MAX_ROWS_PER_TABLE = 16;
const MAX_TOTAL_ROWS = 48;
const TABLE_FORWARD_TOKENS = 400;

export function scanTables(text: string): TableRowClaim[] {
  if (typeof text !== "string" || text.length === 0) return [];
  const tokens = tokenize(text);
  const claims: TableRowClaim[] = [];

  // ---- find header runs ----
  // A header run = ≥MIN_HEADER_PERIODS period tokens where consecutive
  // period tokens are separated by ≤2 non-number tokens and NO numbers.
  let i = 0;
  while (i < tokens.length && claims.length < MAX_TOTAL_ROWS) {
    if (tokens[i].kind !== "period") {
      i++;
      continue;
    }
    const headerPeriods: string[] = [];
    let j = i;
    let gap = 0;
    let lastPeriodTokenIdx = i;
    while (j < tokens.length) {
      const t = tokens[j];
      if (t.kind === "period") {
        headerPeriods.push(normalizePeriod(t.text));
        lastPeriodTokenIdx = j;
        gap = 0;
        j++;
        continue;
      }
      if (t.kind === "word" && gap < 2) {
        gap++;
        j++;
        continue;
      }
      break;
    }
    if (headerPeriods.length < MIN_HEADER_PERIODS) {
      i++;
      continue;
    }

    // ---- parse rows after the header ----
    // Resume at the token right after the LAST period — the word-gap
    // tolerance above may have consumed the first row's label ("Net
    // Revenue" after "…Q3FY26E"), which must stay available to the
    // row parser.
    const rowsStart = lastPeriodTokenIdx + 1;
    parseTableRows(tokens, rowsStart, headerPeriods, text, claims);
    i = rowsStart;
  }
  return claims;
}

function parseTableRows(
  tokens: Token[],
  startIdx: number,
  headerPeriods: string[],
  text: string,
  claims: TableRowClaim[],
): void {
  const headerCount = headerPeriods.length;
  // Index of the latest ACTUAL column and the first estimate after it.
  let latestActualIdx = -1;
  let bestRank = -1;
  for (let k = 0; k < headerCount; k++) {
    if (isEstimatePeriod(headerPeriods[k])) continue;
    const r = periodRank(headerPeriods[k]);
    if (r >= bestRank) {
      bestRank = r;
      latestActualIdx = k;
    }
  }
  let estimateIdx = -1;
  for (let k = latestActualIdx + 1; k < headerCount; k++) {
    if (isEstimatePeriod(headerPeriods[k])) {
      estimateIdx = k;
      break;
    }
  }
  if (latestActualIdx < 0) return;

  let idx = startIdx;
  let rowsEmitted = 0;
  let blockHint: string | undefined;
  let lastPrimaryLabel = "";
  const limit = Math.min(tokens.length, startIdx + TABLE_FORWARD_TOKENS);

  while (idx < limit && rowsEmitted < MAX_ROWS_PER_TABLE && claims.length < MAX_TOTAL_ROWS) {
    // A new header run terminates this table.
    if (tokens[idx].kind === "period") {
      let lookahead = 0;
      for (let k = idx; k < Math.min(idx + 6, tokens.length); k++) {
        if (tokens[k].kind === "period") lookahead++;
      }
      if (lookahead >= MIN_HEADER_PERIODS) break;
      idx++;
      continue;
    }
    if (tokens[idx].kind === "num") {
      idx++;
      continue;
    }

    // Collect a word run (candidate label or block header).
    const labelTokens: Token[] = [];
    while (
      idx < limit &&
      tokens[idx].kind === "word" &&
      labelTokens.length < MAX_LABEL_TOKENS
    ) {
      labelTokens.push(tokens[idx]);
      idx++;
    }
    if (labelTokens.length === 0) {
      idx++;
      continue;
    }
    const labelText = labelTokens.map((t) => t.text).join(" ").trim();

    // Count the numeric run that follows.
    const numTokens: Token[] = [];
    let k = idx;
    while (k < limit && tokens[k].kind === "num") {
      numTokens.push(tokens[k]);
      k++;
    }

    if (numTokens.length < MIN_ROW_NUMS) {
      // Word run with no numeric row → candidate block header.
      const bh = labelText.match(BLOCK_HINT_RE);
      if (bh) blockHint = bh[1];
      continue; // idx already advanced past the words
    }

    idx = k; // consume the numbers

    if (LABEL_STOPWORDS.test(labelText)) continue;
    if (!/[A-Za-z]/.test(labelText)) continue;

    // Column alignment. Exact match → direct mapping. Right-aligned
    // within a tolerance of 2 → map value_v ↔ period_{offset+v}.
    const offset = headerCount - numTokens.length;
    if (offset < 0 || offset > 2) continue;
    const actualCol = latestActualIdx - offset;
    if (actualCol < 0 || actualCol >= numTokens.length) continue;

    // Block-header phrase glued to the first row of its block:
    // "Segment Revenue Havells (ex-Lloyd) 37,540 …" → blockHint
    // "Segment Revenue", label "Havells (ex-Lloyd)".
    let effectiveLabel = cleanLabel(labelText);
    const prefixMatch = labelText.match(BLOCK_PREFIX_RE);
    if (prefixMatch) {
      blockHint = prefixMatch[1];
      effectiveLabel = cleanLabel(prefixMatch[2]);
    }
    if (!effectiveLabel) continue;

    // Carry-labels ("YoY" after "Net Revenue") get the primary prefix.
    let label = effectiveLabel;
    if (CARRY_LABEL_RE.test(effectiveLabel) && lastPrimaryLabel) {
      label = `${lastPrimaryLabel} ${effectiveLabel}`;
    } else {
      lastPrimaryLabel = effectiveLabel;
    }

    const value = numTokens[actualCol].text;
    let estimate: string | undefined;
    let estimatePeriod: string | undefined;
    if (estimateIdx >= 0) {
      const estCol = estimateIdx - offset;
      if (estCol >= 0 && estCol < numTokens.length) {
        estimate = numTokens[estCol].text;
        estimatePeriod = headerPeriods[estimateIdx];
      }
    }

    const evidenceStart = labelTokens[0].start;
    const evidenceEnd = numTokens[numTokens.length - 1].end;
    const evidence = text
      .slice(evidenceStart, Math.min(evidenceEnd, evidenceStart + 200))
      .replace(/\s+/g, " ")
      .trim();

    claims.push({
      label,
      blockHint,
      period: headerPeriods[latestActualIdx],
      value,
      ...(estimate ? { estimate, estimatePeriod } : {}),
      evidence,
    });
    rowsEmitted++;
  }
}

// Strip dangling parens/punctuation the tokenizer can introduce
// ("Havells ex-Lloyd)" → "Havells ex-Lloyd").
function cleanLabel(raw: string): string {
  return raw
    .replace(/^[()[\]{}"'.,;:\s-]+/, "")
    .replace(/[()[\]{}"'.,;:\s-]+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ---- selection helpers for baseline integration ----

const FINANCIAL_METRIC_RE =
  /\b(revenue|sales|ebitda|ebit\b|pat\b|eps\b|net profit|gross profit|margin|ocf|fcf|cash|debt|other income|costs?|expenses?|d&a|depreciation|tax)\b/i;

// Cost/expense lines are classified as financial (so they stay OUT of
// segment claims) but are NOISE for the keyClaims top-up — the thesis
// hangs on revenue / margins / profits, not on the absolute expense
// lines. "Other income" stays eligible (earnings-quality signal).
const COST_NOISE_RE =
  /\b(raw material|employee cost|other expenses?|d&a|depreciation|finance cost|total dividend|tax)\b/i;

// Rank: prefer rows with an estimate column (beat/miss read), then YoY /
// margin blocks, then recency.
function rowScore(row: TableRowClaim): number {
  let score = 0;
  if (row.estimate) score += 4;
  if (row.blockHint && /yoy|growth/i.test(row.blockHint)) score += 3;
  if (/yoy|growth/i.test(row.label)) score += 3;
  if (row.blockHint && /margin/i.test(row.blockHint)) score += 2;
  if (/margin/i.test(row.label)) score += 2;
  // EBITDA outranks gross/EBIT variants within a family — it's the
  // margin the thesis usually hangs on.
  if (/ebitda/i.test(row.label)) score += 1;
  score += periodRank(row.period) / 1000; // recency as a tiebreaker
  return score;
}

// Parse a numeric token loosely for delta math: "33%" → 33,
// "(8,286)" → -8286, "1,85,499" → 185499. Returns NaN when unparseable.
function looseNumber(raw: string | undefined): number {
  if (!raw) return NaN;
  let s = raw.trim();
  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[%,]/g, "");
  const n = parseFloat(s);
  return negative ? -n : n;
}

// Beat/miss delta in percentage points. Only percentage rows qualify —
// INR-level rows have arbitrary absolute deltas (6,244 vs 6,230 is an
// in-line print, not a 14-point surprise) and would swamp the ranking.
function surpriseDelta(row: TableRowClaim): number {
  if (!row.value.includes("%") || !(row.estimate ?? "").includes("%")) return 0;
  const a = looseNumber(row.value);
  const e = looseNumber(row.estimate);
  if (!Number.isFinite(a) || !Number.isFinite(e)) return 0;
  return Math.abs(a - e);
}

// Aggregate rows ("Havells (ex-Lloyd)", "Total", "Consolidated")
// duplicate the company-level read that the P&L rows already carry.
const AGGREGATE_LABEL_RE = /\b(ex-|total|overall|consolidated)\b/i;

// Financial-metric rows (P&L / IS lines) for financials.keyClaims top-up.
// Metric family for diversity: a thesis re-test wants ONE growth read,
// ONE margin read, ONE level (revenue/EPS) read — not three redundant
// growth rows. Selection round-robins the families by score.
type MetricFamily = "growth" | "margin" | "level";
function metricFamily(row: TableRowClaim): MetricFamily {
  const s = `${row.blockHint ?? ""} ${row.label}`.toLowerCase();
  if (/margin/.test(s)) return "margin";
  if (/yoy|growth/.test(s)) return "growth";
  return "level";
}

export function selectFinancialRows(
  rows: TableRowClaim[],
  cap: number,
): TableRowClaim[] {
  const seen = new Set<string>();
  const eligible = rows
    .filter((r) => FINANCIAL_METRIC_RE.test(r.label))
    .filter((r) => !COST_NOISE_RE.test(r.label))
    .filter((r) => !(r.blockHint && /revenue mix/i.test(r.blockHint)))
    .sort((a, b) => rowScore(b) - rowScore(a))
    .filter((r) => {
      const key = r.label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  // Family round-robin: best growth, best margin, best level, then the
  // overall remainder by score.
  const byFamily: Record<MetricFamily, TableRowClaim[]> = {
    growth: [],
    margin: [],
    level: [],
  };
  for (const r of eligible) byFamily[metricFamily(r)].push(r);
  const out: TableRowClaim[] = [];
  const order: MetricFamily[] = ["growth", "margin", "level"];
  let depth = 0;
  while (out.length < cap) {
    let advanced = false;
    for (const fam of order) {
      const candidate = byFamily[fam][depth];
      if (candidate && out.length < cap) {
        out.push(candidate);
        advanced = true;
      }
    }
    if (!advanced) break;
    depth++;
  }
  return out;
}

// Segment rows: labels that are NOT generic P&L metrics, found inside
// segment-flavored blocks. These carry the names the memo itself uses
// (Switchgears, Cables & Wires, Lloyd Electric, …) — no hardcoded
// company-specific keyword lists.
export function selectSegmentRows(
  rows: TableRowClaim[],
  cap: number,
): TableRowClaim[] {
  const seen = new Set<string>();
  const segScore = (r: TableRowClaim): number => {
    let s = rowScore(r);
    // Surprise-weighted: a 33%-vs-21%E beat (delta 12) is the thesis
    // headline; an 8%-vs-8%E in-line row is filler. Capped so absolute
    // INR-level rows (delta in the thousands) don't swamp the ranking.
    s += Math.min(4, surpriseDelta(r) / 3);
    if (AGGREGATE_LABEL_RE.test(r.label)) s -= 2;
    return s;
  };
  return rows
    .filter((r) => !FINANCIAL_METRIC_RE.test(r.label))
    .filter(
      (r) =>
        r.blockHint !== undefined ||
        /^[A-Z]/.test(r.label), // proper-noun-looking labels without a block hint
    )
    .filter((r) => !(r.blockHint && /revenue mix/i.test(r.blockHint)))
    .sort((a, b) => segScore(b) - segScore(a))
    .filter((r) => {
      // One row per segment label+block kind.
      const key = `${r.label.toLowerCase()}|${(r.blockHint ?? "").toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, cap);
}
