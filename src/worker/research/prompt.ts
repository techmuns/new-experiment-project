import type {
  ResearchUpdatesRequest,
  ThesisCheckpoint,
} from "@shared/types";

export interface ResearchPromptResult {
  system: string;
  user: string;
}

export function buildResearchPrompt(
  req: ResearchUpdatesRequest,
): ResearchPromptResult {
  const system = [
    "You are a buy-side investment analyst conducting source-grounded follow-up research on a public company.",
    "Your job is to discover developments between a detected memo period and today that materially affect the original investment thesis.",
    "",
    "Rules you must follow:",
    "- Use only sources you actually found via the web_search tool. Do NOT invent URLs, dates, publishers, or quotes.",
    "- If you have no real source for a claim, omit the claim — or set its impact to 'neutral' and prefix `relevance` with 'Insufficient source coverage.'",
    "- If you found no usable sources at all, return findings: [] and add a warning to the warnings[] array.",
    "- Do not bring in opinions or commentary that lack a sourced finding.",
    "- No fake precision. No generic AI commentary. No 'we expect' / 'we believe' language unless it is attributable to a named cited source.",
    "- Bias to recent, primary sources: company filings (exchange notices, annual reports), earnings call transcripts, official investor presentations, regulator notices, and reputable financial press. Avoid blog rehashes when a primary source exists.",
    "- Emit a single JSON object matching the provided schema. No prose outside the JSON.",
    "",
    "Focus areas (in priority order):",
    "  1. Latest financial results (revenue, ARR, margin, FCF, recurring quality).",
    "  2. Earnings-call / management commentary.",
    "  3. Exchange filings and company announcements.",
    "  4. Investor presentations.",
    "  5. Guidance changes.",
    "  6. Broker / consensus changes (only if surfaced by a sourced finding).",
    "  7. Valuation movement (price, multiples, peer comp).",
    "  8. Peer developments material to the thesis.",
    "  9. Macro / industry risks relevant to the company.",
    " 10. AI / technology disruption risk.",
    " 11. Anything else that directly affects the original thesis checkpoints listed in the user prompt.",
    "",
    "For each finding:",
    "- Give it a short stable id (e.g. 'f01', 'f02'...) so the downstream memo can cite it.",
    "- Classify it under one of the schema's enumerated categories.",
    "- Choose impact ∈ {positive, negative, neutral, watch}. 'watch' = the development warrants monitoring but the directional impact isn't clear yet.",
    "- Write a 1-2 sentence summary and a 1-2 sentence relevance note tying it back to the original memo's thesis.",
    "- List every source you used. Each source object must have title, url, and (when known) date and a short note.",
    "- When a finding clearly maps to one of the thesis checkpoints provided in the user prompt, set thesisCheckpointId to that checkpoint id; otherwise null.",
    "",
    "Also produce:",
    "- positiveDevelopments / negativeDevelopments / neutralOrWatch — the finding ids grouped by impact.",
    "- thesisCheckpointImpact — for each thesis checkpoint, whether it is supported / challenged / no_update, with a 1-sentence note and the finding ids.",
    "- unresolvedQuestions — open questions a human reviewer must investigate manually.",
    "- warnings — surface any limitation (e.g. 'No earnings call transcript publicly available for the latest quarter.').",
  ].join("\n");

  return { system, user: buildResearchUserPrompt(req) };
}

function buildResearchUserPrompt(req: ResearchUpdatesRequest): string {
  const { project, initialMemo, dna, detection, thesisCheckpoints, scope } =
    req;
  const lines: string[] = [];

  lines.push("# 1. Company");
  lines.push(`- Name: ${project.companyName}`);
  if (project.ticker) lines.push(`- Ticker: ${project.ticker}`);
  if (project.sector) lines.push(`- Sector: ${project.sector}`);
  if (detection.detectedCompany && detection.detectedCompany !== project.companyName) {
    lines.push(`- Detected from memo text: ${detection.detectedCompany}`);
  }

  lines.push("");
  lines.push("# 2. Research window");
  lines.push(`- Memo latest period (label only): ${detection.periodLabel}`);
  if (detection.researchStart) {
    lines.push(
      `- Look for developments BETWEEN ${detection.researchStart} and ${detection.researchCurrent} (inclusive).`,
    );
  } else {
    lines.push(
      `- Memo period is fiscal-label-only (no calendar mapping). Look for developments from the most recent quarter you can attribute to the company, through ${detection.researchCurrent}. Acknowledge this assumption in warnings[].`,
    );
  }
  if (detection.assumptionNotes && detection.assumptionNotes.length > 0) {
    lines.push("- Period assumption notes to acknowledge:");
    for (const note of detection.assumptionNotes) lines.push(`  - ${note}`);
  }

  lines.push("");
  lines.push("# 3. Original memo style summary");
  lines.push(`- Tone adjectives: ${dna.styleTone.adjectives.join(", ") || "—"}`);
  lines.push(`- Analytical framework: ${dna.analyticalFramework.join("; ") || "—"}`);

  lines.push("");
  lines.push("# 4. Original memo text");
  lines.push(`Source: ${initialMemo.sourceFilename}`);
  lines.push("```text");
  lines.push(initialMemo.text);
  lines.push("```");

  const checkpoints = thesisCheckpoints ?? dna.thesisCheckpoints;
  lines.push("");
  lines.push("# 5. Thesis checkpoints to test");
  if (checkpoints.length === 0) {
    lines.push("_No structured checkpoints provided._");
  } else {
    for (const c of checkpoints) {
      lines.push(
        `- ${c.id}: ${c.label} (expected direction: ${c.expectedDirection})`,
      );
      if (c.rationale) lines.push(`  rationale: ${c.rationale}`);
    }
  }

  const scopeLine = scopeSummary(scope);
  if (scopeLine) {
    lines.push("");
    lines.push("# 6. Scope");
    lines.push(scopeLine);
  }

  lines.push("");
  lines.push("# 7. Output requirements");
  lines.push(
    "- Use web_search to find primary sources. Quote URLs verbatim — do not paraphrase them.",
  );
  lines.push(
    "- Every finding with impact ≠ neutral must carry at least one source with a working url.",
  );
  lines.push(
    "- The server will downgrade unsourced positive/negative/watch findings to neutral and add a warning.",
  );
  lines.push(
    "- Emit a single JSON object matching the schema. No prose outside the JSON.",
  );

  return lines.join("\n");
}

function scopeSummary(
  scope: ResearchUpdatesRequest["scope"],
): string | undefined {
  if (!scope) return undefined;
  if (typeof scope.maxFindings === "number" && scope.maxFindings > 0) {
    return `- Maximum findings to emit: ${scope.maxFindings}.`;
  }
  return undefined;
}

export type { ThesisCheckpoint };
