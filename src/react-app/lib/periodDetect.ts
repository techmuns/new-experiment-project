import type {
  DetectedPeriod,
  DetectionConfidence,
  PeriodDetectionResult,
} from "@shared/types";
import { detectCompanyFromText } from "./memoDna";

// Deterministic period detection from memo text. NO silent FY/Q -> calendar
// month conversion: fiscal-only candidates carry label fields and the
// detection result emits assumptionNotes the workspace must surface.

const MONTH_NAMES_LONG: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const MONTH_NAMES_SHORT: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const ISO_DATE_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const MONTH_YEAR_RE =
  /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\s+(\d{4})\b/gi;
const QUARTER_FY_RE = /\bQ([1-4])\s*FY\s*(\d{2,4})\b/gi;
const FISCAL_YEAR_RE = /\bFY\s*(\d{2,4})\b/gi;
const YEAR_ENDED_RE =
  /\byear\s+end(?:ed|ing)\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\s+(\d{4})\b/gi;
const ANCHOR_PHRASE_RE =
  /\b(latest|current|recent|as\s+of|year\s+to\s+date|ytd)\s+(quarter|period|year|month|results?)\b/gi;

interface RankedCandidate {
  period: DetectedPeriod;
  rankScore: number;       // higher = better candidate kind
  anchored: boolean;       // near an anchor phrase / heading
  sortValue: number;       // higher = more recent
  matchIndex: number;      // position in text, for stable tie-break
}

export function detectPeriodFromMemoText(
  text: string,
  asOf?: Date,
): PeriodDetectionResult {
  const safeText = typeof text === "string" ? text : "";
  const now = asOf instanceof Date ? asOf : new Date();
  const researchCurrent = isoMonthFromDate(now);

  const detectedCompany = safeText.length > 0
    ? detectCompanyFromText(safeText, "")
    : undefined;

  const ranked: RankedCandidate[] = [];

  // Anchored regions: any text within 80 chars of an anchor phrase
  // (or inside a markdown heading line) counts as anchored.
  const anchorIndices = findAnchorIndices(safeText);

  // ISO dates -> concrete date + month
  for (const m of safeText.matchAll(ISO_DATE_RE)) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (!isValidDate(year, month, day)) continue;
    const isoDate = `${pad4(year)}-${pad2(month)}-${pad2(day)}`;
    ranked.push({
      period: {
        rawMatch: m[0],
        kind: "iso_date",
        isoDate,
        isoMonth: `${pad4(year)}-${pad2(month)}`,
      },
      rankScore: 5,
      anchored: isAnchored(m.index ?? 0, anchorIndices, safeText),
      sortValue: dateSortValue(year, month, day),
      matchIndex: m.index ?? 0,
    });
  }

  // Year ended <Month> <Year> -> use the trailing month-year as concrete.
  for (const m of safeText.matchAll(YEAR_ENDED_RE)) {
    const month = monthIndexFromName(m[1]);
    const year = Number(m[2]);
    if (!month || !isValidYear(year)) continue;
    ranked.push({
      period: {
        rawMatch: m[0],
        kind: "month_year",
        isoMonth: `${pad4(year)}-${pad2(month)}`,
        monthLabel: `${capitalizeMonth(m[1])} ${year}`,
      },
      rankScore: 4,
      anchored: true,
      sortValue: dateSortValue(year, month, 1),
      matchIndex: m.index ?? 0,
    });
  }

  // Generic Month + Year -> concrete month.
  for (const m of safeText.matchAll(MONTH_YEAR_RE)) {
    const month = monthIndexFromName(m[1]);
    const year = Number(m[2]);
    if (!month || !isValidYear(year)) continue;
    ranked.push({
      period: {
        rawMatch: m[0],
        kind: "month_year",
        isoMonth: `${pad4(year)}-${pad2(month)}`,
        monthLabel: `${capitalizeMonth(m[1])} ${year}`,
      },
      rankScore: 4,
      anchored: isAnchored(m.index ?? 0, anchorIndices, safeText),
      sortValue: dateSortValue(year, month, 1),
      matchIndex: m.index ?? 0,
    });
  }

  // Q + FY -> label only, no calendar mapping.
  for (const m of safeText.matchAll(QUARTER_FY_RE)) {
    const quarter = (`Q${m[1]}`) as DetectedPeriod["quarter"];
    const fyNum = normalizeFiscalYear(m[2]);
    if (!quarter || !fyNum) continue;
    ranked.push({
      period: {
        rawMatch: m[0],
        kind: "quarter_fy",
        quarter,
        fiscalYearLabel: `FY${String(fyNum).slice(-2).padStart(2, "0")}`,
        fiscalYearNumber: fyNum,
      },
      rankScore: 3,
      anchored: isAnchored(m.index ?? 0, anchorIndices, safeText),
      sortValue: fiscalSortValue(fyNum, parseInt(m[1] ?? "0", 10)),
      matchIndex: m.index ?? 0,
    });
  }

  // FY only -> label only.
  for (const m of safeText.matchAll(FISCAL_YEAR_RE)) {
    const fyNum = normalizeFiscalYear(m[1]);
    if (!fyNum) continue;
    // Skip if this overlaps a Q+FY match (already captured above).
    if (isInsideQuarterFyMatch(safeText, m.index ?? 0)) continue;
    ranked.push({
      period: {
        rawMatch: m[0],
        kind: "fiscal_year",
        fiscalYearLabel: `FY${String(fyNum).slice(-2).padStart(2, "0")}`,
        fiscalYearNumber: fyNum,
      },
      rankScore: 2,
      anchored: isAnchored(m.index ?? 0, anchorIndices, safeText),
      sortValue: fiscalSortValue(fyNum, 4),
      matchIndex: m.index ?? 0,
    });
  }

  // Anchored phrase like "latest quarter" — label only, no period values.
  for (const m of safeText.matchAll(ANCHOR_PHRASE_RE)) {
    ranked.push({
      period: { rawMatch: m[0], kind: "phrase" },
      rankScore: 1,
      anchored: true,
      sortValue: 0,
      matchIndex: m.index ?? 0,
    });
  }

  // Sort: highest rankScore first; within rank, highest sortValue (most
  // recent); within tie, earlier matchIndex first (stable).
  ranked.sort((a, b) => {
    if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
    if (b.sortValue !== a.sortValue) return b.sortValue - a.sortValue;
    return a.matchIndex - b.matchIndex;
  });

  // De-duplicate by (kind + isoMonth/isoDate/fiscal label).
  const dedupKey = (c: RankedCandidate): string => {
    const p = c.period;
    return `${p.kind}|${p.isoDate ?? ""}|${p.isoMonth ?? ""}|${p.fiscalYearLabel ?? ""}|${p.quarter ?? ""}`;
  };
  const seen = new Set<string>();
  const candidates: DetectedPeriod[] = [];
  for (const c of ranked) {
    const key = dedupKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(c.period);
  }

  const best = candidates[0];
  const bestAnchored = ranked.find((c) => c.period === best)?.anchored ?? false;

  // researchStart only set when best is concrete.
  const researchStart =
    best && (best.kind === "iso_date" || best.kind === "month_year")
      ? best.isoMonth
      : undefined;

  // Confidence per spec.
  const confidence: DetectionConfidence = (() => {
    if (!best) return "low";
    if (
      (best.kind === "iso_date" || best.kind === "month_year") &&
      bestAnchored
    ) {
      return "high";
    }
    if (best.kind === "iso_date" || best.kind === "month_year") return "medium";
    if (best.kind === "quarter_fy" && bestAnchored) return "medium";
    return "low";
  })();

  const assumptionNotes: string[] = [];
  if (!best) {
    assumptionNotes.push(
      "No explicit date found in memo; please set the research start month manually.",
    );
  } else if (best.kind === "quarter_fy" || best.kind === "fiscal_year") {
    assumptionNotes.push(
      `${best.fiscalYearLabel ?? "FY"} detected; fiscal calendar unknown — please confirm the research start month.`,
    );
  } else if (best.kind === "phrase") {
    assumptionNotes.push(
      "Memo mentions a relative period only; please confirm the research start month manually.",
    );
  }
  if (candidates.length >= 3 && best) {
    const label = periodLabel(best);
    if (label) assumptionNotes.push(`Multiple periods detected; using most recent: ${label}.`);
  }

  return {
    detectedCompany,
    candidates,
    best,
    researchStart,
    researchCurrent,
    confidence,
    assumptionNotes,
  };
}

// Public helper so the UI can render a consistent label for any period.
export function periodLabel(p: DetectedPeriod): string {
  switch (p.kind) {
    case "iso_date":
      return p.isoDate ?? "—";
    case "month_year":
      return p.monthLabel ?? p.isoMonth ?? "—";
    case "quarter_fy":
      return `${p.quarter ?? ""} ${p.fiscalYearLabel ?? ""}`.trim();
    case "fiscal_year":
      return p.fiscalYearLabel ?? "—";
    case "phrase":
      return p.rawMatch;
  }
}

// ---------- helpers ----------

function findAnchorIndices(text: string): number[] {
  const indices: number[] = [];
  for (const m of text.matchAll(ANCHOR_PHRASE_RE)) {
    if (m.index !== undefined) indices.push(m.index);
  }
  // Heading lines: indices of "^#" markers
  const lines = text.split("\n");
  let offset = 0;
  for (const line of lines) {
    if (/^\s{0,3}#/.test(line)) indices.push(offset);
    offset += line.length + 1;
  }
  return indices;
}

function isAnchored(
  matchIndex: number,
  anchorIndices: number[],
  text: string,
): boolean {
  for (const a of anchorIndices) {
    if (Math.abs(matchIndex - a) <= 80) return true;
  }
  // Also count: same line as any heading.
  const lineStart = text.lastIndexOf("\n", matchIndex) + 1;
  if (text.slice(lineStart, lineStart + 4).match(/^\s{0,3}#/)) return true;
  return false;
}

function monthIndexFromName(name: string | undefined): number | undefined {
  if (!name) return undefined;
  const k = name.toLowerCase();
  return MONTH_NAMES_LONG[k] ?? MONTH_NAMES_SHORT[k];
}

function capitalizeMonth(name: string): string {
  if (name.length === 0) return name;
  return name[0]!.toUpperCase() + name.slice(1).toLowerCase();
}

function normalizeFiscalYear(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.replace(/^0+(?=\d)/, "");
  const n = parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  if (n < 100) {
    // Two-digit FY: assume 2000-2099 since memos are forward-looking.
    return 2000 + n;
  }
  if (n >= 1900 && n <= 2200) return n;
  return undefined;
}

function fiscalSortValue(fyNumber: number, quarter: number): number {
  return fyNumber * 100 + Math.max(1, Math.min(4, quarter));
}

function dateSortValue(year: number, month: number, day: number): number {
  return year * 10000 + month * 100 + day;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

function isValidDate(y: number, m: number, d: number): boolean {
  if (!isValidYear(y)) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  return true;
}

function isValidYear(y: number): boolean {
  return Number.isFinite(y) && y >= 1900 && y <= 2200;
}

function isInsideQuarterFyMatch(text: string, idx: number): boolean {
  // Cheap check: if the 6 chars before idx contain "Q1"-"Q4" + whitespace,
  // this FY match is already counted by QUARTER_FY_RE.
  const start = Math.max(0, idx - 6);
  const slice = text.slice(start, idx);
  return /Q[1-4]\s*$/i.test(slice);
}

function isoMonthFromDate(d: Date): string {
  return `${pad4(d.getUTCFullYear())}-${pad2(d.getUTCMonth() + 1)}`;
}
