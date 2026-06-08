import type { GenerateFollowUpMemoRequest } from "@shared/types";

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
    sec_q4_retest: "Q4 / Latest Financial Re-test",
    sec_mgmt_retest: "Management Commentary Re-test",
    sec_ai_macro_risk: "AI / Macro / Competitive Risk Check",
    sec_memo_held: "Where the Original Memo Held",
    sec_memo_broke: "Where the Original Memo Broke",
    sec_eps_bridge: "FY27–FY28 EPS Credibility Bridge",
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
  const system = [
    "You are a buy-side investment analyst updating an original investment thesis.",
    "You write follow-up memos in the same voice and structure as the original memo.",
    "",
    "Rules you must follow:",
    "- Preserve the original memo's style, tone, and structure.",
    "- Use ONLY material provided in this request. Do not bring in outside knowledge or recent events.",
    "- Clearly separate where the original memo HELD vs where it BROKE.",
    "- Flag missing data explicitly. Do not invent numbers, dates, or commentary.",
    "- No fake precision. No unsupported claims. No generic AI commentary.",
    "- Cite only documentIds listed in the 'Available document IDs' table below.",
    "- Emit a single JSON object matching the provided schema. Do not include prose outside the JSON.",
    "",
    "Output must contain exactly 9 sections in canonical order, matching these ids:",
    CANONICAL_SECTION_IDS.map(
      (id, i) => `  ${i + 1}. ${id} — ${CANONICAL_TITLES[id]}`,
    ).join("\n"),
  ].join("\n");

  return { system, user: buildUserPrompt(req), jsonSchema };
}

function buildUserPrompt(req: GenerateFollowUpMemoRequest): string {
  const { project, initialMemo, updateDocs, dna, analysis } = req;
  const lines: string[] = [];

  lines.push("# 1. Project");
  lines.push(`- Ticker: ${project.ticker}`);
  lines.push(`- Company: ${project.companyName}`);
  if (project.sector) lines.push(`- Sector: ${project.sector}`);

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
  lines.push("# 5. Update-pack documents");
  if (updateDocs.length === 0) {
    lines.push("_No update-pack documents provided._");
  } else {
    for (const doc of updateDocs) {
      lines.push(`## ${doc.filename} (${doc.kind}) [id: ${doc.id}]`);
      lines.push("```text");
      lines.push(doc.text);
      lines.push("```");
      lines.push("");
    }
  }

  lines.push("# 6. Deterministic update-pack analysis (compact JSON)");
  lines.push("```json");
  lines.push(JSON.stringify(analysis));
  lines.push("```");

  lines.push("");
  lines.push("# 7. Available document IDs");
  lines.push("Cite only these documentIds:");
  if (initialMemo.id) {
    lines.push(
      `- ${initialMemo.id} → ${initialMemo.sourceFilename} (initial_memo)`,
    );
  }
  for (const doc of updateDocs) {
    lines.push(`- ${doc.id} → ${doc.filename} (${doc.kind})`);
  }

  lines.push("");
  lines.push("# 8. Output requirements");
  lines.push(
    "- Exactly 9 sections, in the canonical order and ids from the system prompt.",
  );
  lines.push(
    "- Each section: id, title, summary (1–2 sentences), body (1 paragraph), bullets (0–6), signal (positive|negative|neutral|watch), sources (cite ids from §7 only).",
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
    "- Emit a single JSON object that matches the schema. Do not include any prose outside the JSON.",
  );

  return lines.join("\n");
}
