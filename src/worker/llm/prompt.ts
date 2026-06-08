import type {
  GenerateFollowUpMemoRequest,
  ResearchFinding,
  ResearchFindings,
} from "@shared/types";

const CANONICAL_SECTION_IDS = [
  "sec_thesis_snapshot",
  "sec_q4_retest",
  "sec_mgmt_retest",
  "sec_ai_macro_risk",
  "sec_memo_held",
  "sec_memo_broke",
  "sec_eps_bridge",
  "sec_valuation_peer_gap",
  "sec_final_action",
] as const;

const CANONICAL_TITLES: Record<(typeof CANONICAL_SECTION_IDS)[number], string> =
  {
    sec_thesis_snapshot: "Original Thesis Snapshot",
    sec_q4_retest: "Latest Financial Re-test",
    sec_mgmt_retest: "Management Commentary Re-test",
    sec_ai_macro_risk: "AI / Macro / Competitive Risk Check",
    sec_memo_held: "Where the Original Memo Held",
    sec_memo_broke: "Where the Original Memo Broke",
    sec_eps_bridge: "EPS Credibility Bridge",
    sec_valuation_peer_gap: "Valuation and Peer Gap",
    sec_final_action: "Final Investment Action",
  };

export interface BuildPromptResult {
  system: string;
  user: string;
  jsonSchema: object;
}

export function buildPrompt(
  req: GenerateFollowUpMemoRequest,
  jsonSchema: object,
): BuildPromptResult {
  const hasResearch =
    Boolean(req.research) && Array.isArray(req.research?.findings);

  const systemLines = [
    "You are a buy-side investment analyst updating an original investment thesis.",
    "You write follow-up memos in the same voice and structure as the original memo.",
    "",
    "Rules you must follow:",
    "- Preserve the original memo's style, tone, and structure.",
    "- Cite only material provided in this request — the original memo and the listed research findings.",
    "- Clearly separate where the original memo HELD vs where it BROKE.",
    "- Flag missing data explicitly. Do not invent numbers, dates, or commentary.",
    "- No fake precision. No unsupported claims. No generic AI commentary.",
    "- Cite only documentIds listed in the 'Available document IDs' table below.",
    "- Emit a single JSON object matching the provided schema. Do not include prose outside the JSON.",
  ];
  if (!hasResearch) {
    systemLines.push(
      "",
      "No current external research was available for this memo. Do NOT invent recent developments. Explicitly state in the relevant sections that no external research was performed, and mark any forward-looking claim with confidenceNote: 'Needs manual verification — generated without external research.'",
    );
  }
  systemLines.push(
    "",
    "Output must contain exactly 9 sections in canonical order, matching these ids:",
    CANONICAL_SECTION_IDS.map(
      (id, i) => `  ${i + 1}. ${id} — ${CANONICAL_TITLES[id]}`,
    ).join("\n"),
  );

  return {
    system: systemLines.join("\n"),
    user: buildUserPrompt(req),
    jsonSchema,
  };
}

function buildUserPrompt(req: GenerateFollowUpMemoRequest): string {
  const { project, initialMemo, dna, research, detection } = req;
  const lines: string[] = [];

  lines.push("# 1. Project");
  lines.push(`- Ticker: ${project.ticker}`);
  lines.push(`- Company: ${project.companyName}`);
  if (project.sector) lines.push(`- Sector: ${project.sector}`);
  if (detection) {
    lines.push(`- Memo latest period: ${detection.periodLabel}`);
    if (detection.researchStart) {
      lines.push(`- Research window: ${detection.researchStart} → ${detection.researchCurrent}`);
    } else {
      lines.push(`- Research window end: ${detection.researchCurrent}`);
    }
    if (detection.assumptionNotes && detection.assumptionNotes.length > 0) {
      lines.push("- Period assumptions to acknowledge:");
      for (const note of detection.assumptionNotes) {
        lines.push(`  - ${note}`);
      }
    }
  }

  lines.push("");
  lines.push("# 2. Original memo style summary");
  lines.push(
    `- Tone adjectives: ${dna.styleTone.adjectives.join(", ") || "—"}`,
  );
  lines.push(
    `- Analytical framework: ${dna.analyticalFramework.join("; ") || "—"}`,
  );

  lines.push("");
  lines.push("# 3. Memo DNA (compact JSON)");
  lines.push("```json");
  lines.push(JSON.stringify(dna));
  lines.push("```");

  lines.push("");
  lines.push("# 4. Original memo text");
  lines.push(`Source: ${initialMemo.sourceFilename}`);
  lines.push("```text");
  lines.push(initialMemo.text);
  lines.push("```");

  lines.push("");
  lines.push("# 5. Research findings");
  if (!research || research.findings.length === 0) {
    lines.push(
      "_No external research findings were provided for this memo. The user explicitly chose to generate without research. Acknowledge this gap in the relevant sections and mark forward-looking claims for manual verification._",
    );
  } else {
    lines.push(
      `Research window: ${research.researchWindow.startIsoMonth} → ${research.researchWindow.endIsoMonth}`,
    );
    lines.push(`Company researched: ${research.company}`);
    lines.push("");
    for (const f of research.findings) {
      lines.push(`## ${f.id} [${f.category}] ${f.title}`);
      lines.push(`Impact: ${f.impact}`);
      lines.push(`Summary: ${f.summary}`);
      lines.push(`Relevance: ${f.relevance}`);
      if (f.sources.length > 0) {
        lines.push("Sources:");
        for (const s of f.sources) {
          const verified = s.verifiedByWebSearch ? " (verified)" : "";
          const date = s.date ? ` · ${s.date}` : "";
          lines.push(`  - ${s.title}${date}${verified}: ${s.url}`);
        }
      } else {
        lines.push("Sources: (none — needs manual verification)");
      }
      lines.push("");
    }
    if (research.thesisCheckpointImpact.length > 0) {
      lines.push("### Thesis checkpoint impact");
      for (const c of research.thesisCheckpointImpact) {
        lines.push(`- ${c.checkpointId} → ${c.impact}: ${c.note}`);
      }
      lines.push("");
    }
    if (research.unresolvedQuestions.length > 0) {
      lines.push("### Unresolved questions");
      for (const q of research.unresolvedQuestions) {
        lines.push(`- ${q}`);
      }
      lines.push("");
    }
    if (research.warnings.length > 0) {
      lines.push("### Research warnings");
      for (const w of research.warnings) {
        lines.push(`- ${w}`);
      }
    }
  }

  lines.push("");
  lines.push("# 6. Available document IDs");
  lines.push("Cite only these documentIds:");
  if (initialMemo.id) {
    lines.push(
      `- ${initialMemo.id} → ${initialMemo.sourceFilename} (initial_memo)`,
    );
  }
  if (research && research.findings.length > 0) {
    for (const f of research.findings) {
      lines.push(`- ${f.id} → research finding (${f.category})`);
    }
  }

  lines.push("");
  lines.push("# 7. Output requirements");
  lines.push(
    "- Exactly 9 sections, in the canonical order and ids from the system prompt.",
  );
  lines.push(
    "- Each section: id, title, summary (1–2 sentences), body (1 paragraph), bullets (0–6), signal (positive|negative|neutral|watch), sources (cite ids from §6 only).",
  );
  lines.push(
    "- For each source, include the documentId (required) plus optional page and quote.",
  );
  lines.push(
    "- 'Where the Original Memo Held' / 'Where the Original Memo Broke' must reflect the actual evidence in §4 and §5, anchored on the checkpoints in §3.",
  );
  lines.push(
    "- 'Final Investment Action' must reflect the overall balance of evidence — no advice beyond what the data supports.",
  );
  lines.push(
    "- Mark any forward-looking claim that lacks a citable source with confidenceNote: 'Needs manual verification.'",
  );
  lines.push(
    "- Emit a single JSON object that matches the schema. Do not include any prose outside the JSON.",
  );

  return lines.join("\n");
}

// Re-export for the research route and trim helpers to share the same
// finding type ergonomics without re-imports.
export type { ResearchFinding, ResearchFindings };
