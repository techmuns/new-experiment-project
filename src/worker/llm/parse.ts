import type {
  FollowUpMemo,
  GenerateFollowUpMemoRequest,
  LlmGenerationWarning,
  MemoSection,
  MemoSectionSignal,
  SourceReference,
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

const SIGNAL_VALUES: MemoSectionSignal[] = [
  "positive",
  "negative",
  "neutral",
  "watch",
];

// Anthropic strict mode requires additionalProperties:false on every
// nested object.
export const FOLLOW_UP_MEMO_TOOL_SCHEMA: object = {
  type: "object",
  additionalProperties: false,
  required: ["sections"],
  properties: {
    sections: {
      type: "array",
      minItems: 9,
      maxItems: 9,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "title",
          "summary",
          "body",
          "bullets",
          "signal",
          "sources",
        ],
        properties: {
          id: { type: "string", enum: CANONICAL_SECTION_IDS },
          title: { type: "string" },
          summary: { type: "string" },
          body: { type: "string" },
          bullets: { type: "array", items: { type: "string" } },
          signal: { type: "string", enum: SIGNAL_VALUES },
          sources: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["documentId"],
              properties: {
                documentId: { type: "string" },
                page: { type: "number" },
                quote: { type: "string" },
              },
            },
          },
          confidenceNote: { type: "string" },
        },
      },
    },
  },
};

// OpenAI Responses-API Structured Outputs (strict json_schema) requires
// every property to appear in `required`, and does not support `minItems`
// / `maxItems`. Optional app-model fields are expressed as nullable type
// unions here; openai.ts normalizes nulls to absent before passing the
// payload to parseLlmJson. The 9-section length invariant is enforced by
// the prompt and by parseLlmJson, not by this schema.
export const FOLLOW_UP_MEMO_OPENAI_SCHEMA: object = {
  type: "object",
  additionalProperties: false,
  required: ["sections"],
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "title",
          "summary",
          "body",
          "bullets",
          "signal",
          "sources",
          "confidenceNote",
        ],
        properties: {
          id: { type: "string", enum: CANONICAL_SECTION_IDS },
          title: { type: "string" },
          summary: { type: "string" },
          body: { type: "string" },
          bullets: { type: "array", items: { type: "string" } },
          signal: { type: "string", enum: SIGNAL_VALUES },
          sources: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["documentId", "page", "quote"],
              properties: {
                documentId: { type: "string" },
                page: { type: ["number", "null"] },
                quote: { type: ["string", "null"] },
              },
            },
          },
          confidenceNote: { type: ["string", "null"] },
        },
      },
    },
  },
};

export type ParseLlmJsonResult =
  | { ok: true; memo: FollowUpMemo; warnings: LlmGenerationWarning[] }
  | { ok: false; code: "malformed_output"; message: string };

export function parseLlmJson(
  input: unknown,
  request: GenerateFollowUpMemoRequest,
  generatedAt: string,
): ParseLlmJsonResult {
  const warnings: LlmGenerationWarning[] = [];

  if (!isPlainObject(input)) {
    return fail("LLM output is not an object");
  }
  const sections = input.sections;
  if (!Array.isArray(sections)) {
    return fail("LLM output is missing a sections array");
  }
  if (sections.length !== 9) {
    return fail(`Expected exactly 9 sections, got ${sections.length}`);
  }

  const allowed = allowedDocumentIds(request);
  const seenIds = new Set<string>();
  const parsedSections: MemoSection[] = [];

  for (let i = 0; i < sections.length; i++) {
    const raw = sections[i];
    if (!isPlainObject(raw)) {
      return fail(`Section ${i} is not an object`);
    }
    const sectionResult = parseSection(raw, i, allowed, warnings);
    if (!sectionResult.ok) return sectionResult;
    const id = sectionResult.section.id;
    if (seenIds.has(id)) {
      return fail(`Duplicate section id: ${id}`);
    }
    seenIds.add(id);
    parsedSections.push(sectionResult.section);
  }

  for (const canonical of CANONICAL_SECTION_IDS) {
    if (!seenIds.has(canonical)) {
      return fail(`Missing canonical section: ${canonical}`);
    }
  }

  const memo: FollowUpMemo = {
    projectId: request.project.id,
    title: `LLM Follow-up Memo v1 — ${request.project.companyName}`,
    generatedAt,
    sections: parsedSections,
    isDemo: false,
  };

  return { ok: true, memo, warnings };
}

function parseSection(
  raw: Record<string, unknown>,
  index: number,
  allowed: Set<string>,
  warnings: LlmGenerationWarning[],
):
  | { ok: true; section: MemoSection }
  | { ok: false; code: "malformed_output"; message: string } {
  const idVal = raw.id;
  if (typeof idVal !== "string" || !isCanonicalId(idVal)) {
    return fail(`Section ${index} has unknown id: ${String(idVal)}`);
  }
  const title = typeof raw.title === "string" ? raw.title : "";
  const summary = typeof raw.summary === "string" ? raw.summary : "";
  const body = typeof raw.body === "string" ? raw.body : "";
  const bullets = Array.isArray(raw.bullets)
    ? raw.bullets.filter((b): b is string => typeof b === "string")
    : [];
  const signal = parseSignal(raw.signal);
  const sources = parseSources(raw.sources, allowed, idVal, warnings);
  const section: MemoSection = {
    id: idVal,
    title,
    body,
    sources,
    summary,
    bullets,
    signal,
  };
  if (typeof raw.confidenceNote === "string") {
    section.confidenceNote = raw.confidenceNote;
  }
  return { ok: true, section };
}

function parseSignal(value: unknown): MemoSectionSignal {
  if (
    typeof value === "string" &&
    (SIGNAL_VALUES as string[]).includes(value)
  ) {
    return value as MemoSectionSignal;
  }
  return "neutral";
}

function parseSources(
  value: unknown,
  allowed: Set<string>,
  sectionId: string,
  warnings: LlmGenerationWarning[],
): SourceReference[] {
  if (!Array.isArray(value)) return [];
  const out: SourceReference[] = [];
  for (const item of value) {
    if (!isPlainObject(item)) continue;
    const docId = item.documentId;
    if (typeof docId !== "string") continue;
    if (!allowed.has(docId)) {
      warnings.push({
        code: "schema_warning",
        message: `Section ${sectionId}: dropped source with unknown documentId "${docId}"`,
      });
      continue;
    }
    const ref: SourceReference = { documentId: docId };
    if (typeof item.page === "number") ref.page = item.page;
    if (typeof item.quote === "string") ref.quote = item.quote;
    out.push(ref);
  }
  return out;
}

function allowedDocumentIds(req: GenerateFollowUpMemoRequest): Set<string> {
  const set = new Set<string>();
  if (req.initialMemo.id) set.add(req.initialMemo.id);
  for (const doc of req.updateDocs) set.add(doc.id);
  return set;
}

function isCanonicalId(
  id: string,
): id is (typeof CANONICAL_SECTION_IDS)[number] {
  return (CANONICAL_SECTION_IDS as readonly string[]).includes(id);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value)
  );
}

function fail(message: string): {
  ok: false;
  code: "malformed_output";
  message: string;
} {
  return { ok: false, code: "malformed_output", message };
}
