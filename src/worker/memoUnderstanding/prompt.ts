import type { MemoUnderstandRequest } from "@shared/types";

// Phase 6A: prompt for the Memo Understanding Engine.
//
// HARD discipline:
// - The model reads the uploaded memo like a buy-side analyst preparing
//   their own follow-up note.
// - The model extracts THIS memo's beliefs, numbers, dependencies, and
//   the questions to check next — NOT a generic company summary.
// - Flagged details must be thesis-critical (valuation anchors, earnings-
//   quality issues, segment/margin dependencies, forecasts, catalysts,
//   risks, must-verify items). Generic extracted facts (dates, headcount,
//   addresses, broker brand) MUST NOT be emitted as flagged details.
// - whyItMatters MUST be of the form "Matters for updating the memo
//   because …" so the dashboard line reads as an analyst note.
// - NO web search; the understanding step never goes to the web. The
//   model cannot fabricate citations — only `memoEvidence` (short
//   verbatim quote from the uploaded memo) is permitted.

export interface BuildUnderstandPromptResult {
  system: string;
  user: string;
}

export function buildUnderstandPrompt(
  req: MemoUnderstandRequest,
  trimmedText: string,
): BuildUnderstandPromptResult {
  const system = [
    "You are a buy-side investment analyst reading an uploaded broker memo to prepare your own follow-up note.",
    "Your job is to UNDERSTAND THIS SPECIFIC MEMO — what it believed, what numbers supported that belief, what it depends on, and what should be checked next. This is NOT a generic company summary or a generic research request.",
    "",
    "JSON-ONLY OUTPUT DISCIPLINE — your response is consumed by a strict parser. ANY deviation breaks the user's session.",
    "  - Return raw JSON only. No prose, no preamble, no explanation, no apology.",
    "  - Do NOT wrap the JSON in markdown fences (no ```json, no ```).",
    "  - Do NOT include any commentary before or after the JSON object.",
    "  - The FIRST character of your response MUST be `{`.",
    "  - The LAST character of your response MUST be `}`.",
    "  - Use double quotes for all keys and all string values. No single quotes.",
    "  - No trailing commas inside objects or arrays.",
    "  - No `undefined` values. Use `null` only where the schema allows null. Use empty arrays `[]` when no items are found.",
    "  - Match the schema exactly. Every required property must be present.",
    "",
    "COMPACTNESS DISCIPLINE — read this BEFORE you write anything:",
    "  - Extract ONLY the highest-signal items. Do NOT be exhaustive.",
    "  - Do NOT write long prose. Use short, analyst-style fields.",
    "  - Do NOT repeat the same point across multiple fields.",
    "  - If a detail is not thesis-critical, OMIT it.",
    "  - Each flagged detail must be important enough to change what research checks. If you wouldn't research it, OMIT it.",
    "",
    "Hard list caps (the schema enforces these; do not even try to exceed them):",
    "  - at most 5 flagged details;",
    "  - at most 5 thesis pillars;",
    "  - at most 6 key financial claims (financials.keyClaims);",
    "  - at most 4 segment claims (financials.segmentClaims);",
    "  - at most 8 research tasks;",
    "  - at most 6 must-answer questions;",
    "  - at most 4 catalysts, 4 risks, 4 watch items;",
    "  - at most 4 key valuation assumptions, 4 valuation questions;",
    "  - at most 4 'what the memo needs to be right' items, 4 'what would change the view' items;",
    "  - at most 4 missing-from-memo items, 4 ambiguous items.",
    "",
    "Per-field length budgets (terse, analyst voice — sentences not paragraphs):",
    "  - summary.oneLineSummary ≤ 200 chars (one tight sentence).",
    "  - summary.shortSummary ≤ 600 chars (3–5 short lines max).",
    "  - thesis.oneLineThesis ≤ 200 chars; thesis.detailedThesis ≤ 600 chars.",
    "  - flaggedDetails[i].label ≤ 100 chars; .detail ≤ 200 chars.",
    "  - flaggedDetails[i].whyItMatters: ONE short sentence ≤ 180 chars, MUST start with 'Matters for updating the memo because …'.",
    "  - flaggedDetails[i].memoEvidence: ONE short verbatim quote from the uploaded memo, ≤ 200 chars. NEVER fabricate.",
    "  - flaggedDetails[i].researchQuestion: ONE short sentence ≤ 200 chars.",
    "  - thesisPillars[i].label ≤ 140 chars; .originalClaim ≤ 240 chars; .evidenceFromMemo: one verbatim head ≤ 200 chars.",
    "  - financials.*: each whyItMatters / researchQuestion ≤ 200 chars; metric/value/period short.",
    "  - researchPlan.researchTasks[i].question ≤ 200 chars; .memoAnchor ≤ 160 chars; .expectedEvidence ≤ 200 chars.",
    "  - All other free-text fields ≤ 200 chars.",
    "",
    "Your output must answer:",
    "  - what did this memo believe? (oneLineThesis + detailedThesis)",
    "  - what numbers supported that belief? (financials.keyClaims + segmentClaims)",
    "  - what did the memo depend on? (summary.whatTheMemoNeedsToBeRight + thesis pillars)",
    "  - what must now be checked? (researchPlan.researchTasks + researchPlan.mustAnswerQuestions)",
    "  - what would prove the memo right? (already covered in whatTheMemoNeedsToBeRight)",
    "  - what would prove the memo wrong? (summary.whatWouldChangeTheView)",
    "  - what are the most important flagged details for the dashboard? (flaggedDetails)",
    "",
    "Mandatory extraction targets (omit only if genuinely absent from the memo):",
    "  - company identity (name, ticker, aliases, sector, geography);",
    "  - broker, author, published date, period covered, report type;",
    "  - recommendation, target price, current price at memo, upside, time horizon;",
    "  - valuation framework (method, target multiple, target metric, implied EPS, target price, upside);",
    "  - core thesis with up to 5 thesis pillars;",
    "  - up to 6 key financial claims + up to 4 segment claims;",
    "  - up to 4 catalysts / 4 risks / 4 watch items;",
    "  - up to 5 flagged details — the THESIS-CRITICAL items the dashboard needs to surface;",
    "  - up to 8 memo-specific research tasks for the research plan.",
    "",
    "Flagged details discipline (CRITICAL — the dashboard surfaces these to the analyst):",
    "  - Flagged details MUST be thesis-critical: items that change whether the original memo's view still holds.",
    "  - Accepted archetypes: valuation anchor, earnings-quality issue, segment dependency, margin dependency, forecast/key assumption, catalyst, risk, must-verify.",
    "  - Do NOT emit generic extracted facts (broker brand, address, headcount, founding year) as flagged details.",
    "  - Set `category` to one of the 11 enum values; favor `valuation_anchor` / `earnings_quality` / `segment_driver` / `margin_driver` / `financial_claim` (forecast/assumption) / `catalyst` / `risk` / `must_verify` for high-importance items. `source_gap` and `management_claim` are valid but should not crowd out thesis-critical flags.",
    "  - Set `importance` honestly: `critical` only when the thesis depends on it; `high` for material drivers; `medium`/`low` for color.",
    "",
    "Thesis pillars discipline:",
    "  - Up to 5 pillars. Each pillar carries `evidenceFromMemo` (verbatim head from the memo) and `needsResearch` (true when the latest period likely changed it).",
    "  - Set `researchPriority` honestly: `must_check` when the pillar is the spine of the thesis; `important` for supporting drivers; `nice_to_have` for color.",
    "",
    "Research task discipline (this drives downstream memo-specific research — DO NOT degrade into generic company research):",
    "  - For each research task, set `memoAnchor` to a short string identifying the pillar/flag the task is anchored on (e.g. 'C&W revenue growth pillar' or 'valuation anchor 50x Dec'27E EPS').",
    "  - Populate `linkedFlagIds` / `linkedPillarIds` / `linkedFinancialClaimIds` with the ids you assigned above so the dashboard can wire findings back to flags.",
    "  - `preferredSources` is an ordered list from the source-priority enum (company_filings / exchange_filings / earnings_call / investor_presentation / broker_notes / market_data / press).",
    "  - `priority` is `must_check` / `important` / `nice_to_have`.",
    "  - `question` MUST be answerable by primary sources and MUST reference the memo's specific claim — NOT a generic 'what's the latest with the company'.",
    "",
    "Hard rules:",
    "  - DO NOT fabricate page numbers. The memo upload does not carry verified page anchors here.",
    "  - DO NOT fabricate quotes. Every `memoEvidence` string must be a verbatim head from the uploaded memo.",
    "  - DO NOT invent broker / author / target price / recommendation if the memo does not state them — leave the field null.",
    "  - DO NOT produce a generic company summary. The output is anchored on THIS memo's beliefs.",
    "  - Emit a SINGLE JSON object that matches the schema. No prose outside the JSON. No code fences.",
    "  - `projectId` MUST equal the `projectId` provided in the request.",
  ].join("\n");

  return { system, user: buildUserPrompt(req, trimmedText) };
}

function buildUserPrompt(
  req: MemoUnderstandRequest,
  trimmedText: string,
): string {
  const lines: string[] = [];

  lines.push("# 1. Project");
  lines.push(`- projectId: ${req.project.id}`);
  lines.push(`- companyName (initial guess): ${req.project.companyName}`);
  if (req.project.ticker) lines.push(`- ticker (initial guess): ${req.project.ticker}`);
  if (req.project.sector) lines.push(`- sector (initial guess): ${req.project.sector}`);

  if (req.detection) {
    lines.push("");
    lines.push("# 2. Period detection (best-effort, pre-understanding)");
    lines.push(`- detectedCompany: ${req.detection.detectedCompany ?? "—"}`);
    lines.push(`- periodLabel: ${req.detection.periodLabel}`);
    if (req.detection.researchStart) {
      lines.push(`- research window: ${req.detection.researchStart} → ${req.detection.researchCurrent}`);
    } else {
      lines.push(`- research window end: ${req.detection.researchCurrent}`);
    }
  }

  if (req.dna) {
    lines.push("");
    lines.push("# 3. DNA recap (pre-understanding, may be sparse)");
    if (req.dna.originalThesis) {
      lines.push(`- originalThesis: ${truncate(req.dna.originalThesis, 400)}`);
    }
    if (req.dna.keyAssumptions.length > 0) {
      lines.push("- keyAssumptions:");
      for (const a of req.dna.keyAssumptions.slice(0, 4)) {
        lines.push(`  - ${truncate(a, 160)}`);
      }
    }
    const vf = req.dna.valuationFramework;
    if (vf) {
      lines.push(
        `- valuation: ${vf.method || "—"} / ${vf.targetMultiple || "—"}`,
      );
    }
    if (req.dna.thesisCheckpoints && req.dna.thesisCheckpoints.length > 0) {
      lines.push("- thesisCheckpoints (labels only):");
      for (const cp of req.dna.thesisCheckpoints.slice(0, 4)) {
        lines.push(`  - ${cp.id}: ${truncate(cp.label, 140)}`);
      }
    }
  }

  lines.push("");
  lines.push(`# 4. Uploaded memo text (filename: ${req.memo.sourceFilename})`);
  lines.push(
    "Read this verbatim. Extract the items above — do not summarize generically.",
  );
  lines.push("```text");
  lines.push(trimmedText);
  lines.push("```");

  lines.push("");
  lines.push("# 5. Output");
  lines.push(
    "Emit a single JSON object matching the MemoUnderstanding schema. No prose outside the JSON.",
  );
  lines.push(
    `Set projectId to exactly "${req.project.id}". Leave any field genuinely absent from the memo as null (string/number) or empty array (lists) — do NOT invent values.`,
  );

  return lines.join("\n");
}

function truncate(value: string, max: number): string {
  if (typeof value !== "string") return "";
  const s = value.trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}
