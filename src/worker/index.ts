// COST CONTROLS (Phase 4A / 4B / 5):
// - 8 MB request body cap; HTTP 413 on excess.
// - Per-doc text trimming server-side (40K chars initial memo; research
//   findings capped per src/worker/llm/trim.ts) — see trim.ts.
// - 60s provider timeout via AbortController + manual user-signal
//   forwarding — see src/worker/llm/abort.ts.
// - Server-clamped max output tokens: default 8000, hard cap 12_000.
//   Client-supplied model overrides are IGNORED — the deployed Worker
//   trusts only c.env.LLM_MODEL.
// - The access gate (Phase 4B) runs BEFORE any provider call so
//   rejected requests cost zero on the provider side.
// - Research endpoint (Phase 5) is OpenAI-only; calls api.openai.com
//   /v1/responses with the web_search built-in tool. Returns
//   research_unavailable if provider is not openai, or if OpenAI itself
//   refuses the tool.
// - No automatic retries on 429 / 5xx.
// - No streaming.
// - NEVER logged: memo content, research content, source quotes,
//   prompts, API key (LLM_API_KEY or OPENAI_API_KEY), the
//   LLM_GATE_SECRET, the X-Memo-LLM-Gate header value, or c.env.
import { Hono } from "hono";
import { demoProject } from "@shared/demo/rategain-project";
import { demoMemoDna } from "@shared/demo/rategain-memo-dna";
import { demoFollowUpMemo } from "@shared/demo/rategain-follow-up-memo";
import type {
  CanonicalSectionId,
  GenerateFollowUpMemoRequest,
  GenerateFollowUpMemoResponse,
  GenerateMemoSectionRequest,
  GenerateMemoSectionResponse,
  HealthResponse,
  LlmGenerationErrorCode,
  LlmProviderName,
  LlmStatusResponse,
} from "@shared/types";
import type { LlmGenerationWarning } from "@shared/types";
import {
  checkGateToken,
  evaluateLlmReadiness,
  getProvider,
} from "./llm/provider";
import { buildPrompt } from "./llm/prompt";
import {
  FOLLOW_UP_MEMO_TOOL_SCHEMA,
  parseLlmJson,
} from "./llm/parse";
import { trimRequestBody, trimRequestBodyCompact } from "./llm/trim";
import { handleResearchUpdates } from "./research/route";
import { handleResearchPass } from "./research/passRoute";
import { handleMemoUnderstand } from "./memoUnderstanding/route";
import {
  CANONICAL_SECTION_IDS,
  buildSectionPrompt,
} from "./llm/sectionPrompt";
import { MEMO_SECTION_OPENAI_SCHEMA } from "./llm/sectionSchema";
import { callOpenAIResponses } from "./llm/openai";
import {
  runSectionExtractRepairLadder,
  runSectionRepair,
  type SectionCallResult,
} from "./llm/jsonRepair";
import { sanitizeMemoSectionForDisplay } from "@shared/sanitizeMemo";

const app = new Hono<{ Bindings: Env }>();

const MAX_BODY_BYTES = 8 * 1024 * 1024;
// Phase 5C: lowered from 8 000 → 5 000 to keep gpt-5.2 well clear of
// timeouts on broker-note-sized memos. Compact mode clamps tighter.
const DEFAULT_MAX_OUTPUT_TOKENS = 5_000;
const COMPACT_MAX_OUTPUT_TOKENS = 3_500;
const HARD_MAX_OUTPUT_TOKENS = 12_000;
// Phase 6B: per-section output budgets for the restructured memo.
// Core sec_* sections are TIGHTER than Phase 5/6A to enforce the
// <3-page memo budget. Supplementary sup_* panels get more headroom
// because they carry the deeper bridges (valuation, EPS, financials).
// Compact is the budget used on the orchestrator's retryCompact attempt.
const SECTION_MAX_OUTPUT_TOKENS: Record<CanonicalSectionId, number> = {
  sec_thesis_scorecard: 1_300,
  sec_what_changed: 900,
  sec_shareholding: 1_100,
  sec_industry_regulatory: 900,
  sec_corporate_events: 900,
  sec_investment_action: 1_100,
  sup_valuation_detail: 1_500,
  sup_eps_bridge: 1_500,
  sup_financials_actuals: 1_700,
};
const SECTION_COMPACT_MAX_OUTPUT_TOKENS: Record<CanonicalSectionId, number> = {
  sec_thesis_scorecard: 900,
  sec_what_changed: 600,
  sec_shareholding: 800,
  sec_industry_regulatory: 600,
  sec_corporate_events: 600,
  sec_investment_action: 800,
  sup_valuation_detail: 1_000,
  sup_eps_bridge: 1_000,
  sup_financials_actuals: 1_200,
};
const SECTION_FORMAT_NAME = "memo_section";
// Phase 5C: pre-call auto-compact guard. If the default-trim assembled
// prompt exceeds this size (rough heuristic ~45k input tokens for
// gpt-5.2), the worker rebuilds the request with trimRequestBodyCompact
// and reprompts ONCE before calling the provider. No second OpenAI call
// is ever issued from this branch.
const MAX_PROMPT_CHARS_SAFE = 180_000;
const MAX_UPDATE_DOCS = 12;
const GATE_HEADER = "x-memo-llm-gate";

app.get("/api/health", (c) => {
  const body: HealthResponse = {
    status: "ok",
    phase: "1-demo",
    timestamp: new Date().toISOString(),
  };
  return c.json(body);
});

app.get("/api/demo/project", (c) => c.json(demoProject));
app.get("/api/demo/memo-dna", (c) => c.json(demoMemoDna));
app.get("/api/demo/follow-up-memo", (c) => c.json(demoFollowUpMemo));

app.get("/api/llm/status", (c) => {
  const r = evaluateLlmReadiness(c.env);
  const body: LlmStatusResponse = {
    llmEnabled: r.llmEnabled,
    providerConfigured: r.providerConfigured,
    apiKeyConfigured: r.apiKeyConfigured,
    apiKeySource: r.apiKeySource,
    provider: r.provider,
    model: r.model,
    gateEnabled: r.gateEnabled,
    gateConfigured: r.gateConfigured,
    llmReady: r.llmReady,
    researchAvailable: r.researchAvailable,
    fallbackAvailable: true,
    warnings: r.warnings,
  };
  return c.json(body);
});

app.post("/api/research/updates", (c) => handleResearchUpdates(c));
app.post("/api/research/pass", (c) => handleResearchPass(c));
app.post("/api/memo/understand", (c) => handleMemoUnderstand(c));

app.post("/api/generate/follow-up-memo", async (c) => {
  const declaredLength = Number(c.req.header("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    return c.json({ error: "payload_too_large" }, 413);
  }

  let bodyText: string;
  try {
    bodyText = await c.req.raw.text();
  } catch {
    return c.json({ error: "body_unreadable" }, 400);
  }
  if (bodyText.length > MAX_BODY_BYTES) {
    return c.json({ error: "payload_too_large" }, 413);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const validation = validateGenerateRequest(parsed);
  if (!validation.ok) {
    return c.json(
      { error: "invalid_request", message: validation.message },
      400,
    );
  }

  const readiness = evaluateLlmReadiness(c.env);
  if (!readiness.llmEnabled) {
    return c.json(
      buildSafeFailure(
        "not_configured",
        "LLM generation is not enabled on this server.",
      ),
    );
  }
  if (!readiness.providerConfigured) {
    return c.json(
      buildSafeFailure(
        "provider_missing",
        "LLM provider is not configured.",
        readiness.provider,
        readiness.model,
      ),
    );
  }
  if (!readiness.apiKeyConfigured) {
    return c.json(
      buildSafeFailure(
        "api_key_missing",
        "LLM API key is not configured.",
        readiness.provider,
        readiness.model,
      ),
    );
  }

  if (readiness.gateEnabled) {
    const gateResult = checkGateToken(c.env, c.req.header(GATE_HEADER));
    if (!gateResult.ok) {
      return c.json(
        buildSafeFailure(
          gateResult.code,
          gateResult.message,
          readiness.provider,
          readiness.model,
        ),
      );
    }
  }

  const provider = getProvider(c.env);
  if (!provider) {
    // Defensive: readiness passed but factory disagreed (rare race).
    return c.json(
      buildSafeFailure(
        "not_configured",
        "LLM provider is not available.",
        readiness.provider,
        readiness.model,
      ),
    );
  }

  // Phase 5C: strict-boolean compact validation. Non-boolean values are
  // safely treated as false; we never fail the request for a bad flag.
  const rawCompact = validation.value.generationOptions?.compact;
  const compactRequested = rawCompact === true;
  let usedCompact = compactRequested;
  let request = compactRequested
    ? trimRequestBodyCompact(validation.value)
    : trimRequestBody(validation.value);
  let maxTokens = compactRequested
    ? COMPACT_MAX_OUTPUT_TOKENS
    : clampMaxTokens(request.generationOptions?.maxTokens);
  const extraWarnings: LlmGenerationWarning[] = [];

  // Wrap the post-validation pipeline in a try/catch so any unexpected
  // error becomes a graceful provider_error rather than HTTP 500 — the
  // client can then fall back to the demo memo or "Generate without
  // research" path. Never logs the underlying error message (may contain
  // user payload).
  try {
    let prompt = buildPrompt(request, FOLLOW_UP_MEMO_TOOL_SCHEMA);
    const initialSize = prompt.system.length + prompt.user.length;

    // Phase 5C: pre-call auto-compact. Single OpenAI call always — this
    // is a rebuild-and-prompt branch, not an auto-retry.
    let autoCompacted = false;
    if (!usedCompact && initialSize > MAX_PROMPT_CHARS_SAFE) {
      autoCompacted = true;
      usedCompact = true;
      request = trimRequestBodyCompact(validation.value);
      maxTokens = COMPACT_MAX_OUTPUT_TOKENS;
      prompt = buildPrompt(request, FOLLOW_UP_MEMO_TOOL_SCHEMA);
      extraWarnings.push({
        code: "schema_warning",
        message:
          "Auto-compacted memo request before provider call: assembled prompt exceeded safe size threshold.",
      });
    }

    console.log(
      JSON.stringify({
        event: "llm_generate_compact",
        auto: autoCompacted,
        compactRequested,
        systemLen: prompt.system.length,
        userLen: prompt.user.length,
        findings: request.research?.findings.length ?? 0,
        maxTokens,
        model: readiness.model,
      }),
    );

    const result = await provider.generate({
      system: prompt.system,
      user: prompt.user,
      jsonSchema: prompt.jsonSchema,
      maxTokens,
      abortSignal: c.req.raw.signal,
    });

    if (!result.ok) {
      return c.json(
        buildSafeFailure(
          translateProviderCode(result.code),
          result.message,
          result.providerName,
          result.modelUsed,
        ),
      );
    }

    const generatedAt = new Date().toISOString();
    const parsedMemo = parseLlmJson(result.json, request, generatedAt);
    if (!parsedMemo.ok) {
      return c.json(
        buildSafeFailure(
          "parse_error",
          parsedMemo.message,
          result.providerName,
          result.modelUsed,
        ),
      );
    }

    const memo = { ...parsedMemo.memo, sourceMode: "llm" as const };
    const body: GenerateFollowUpMemoResponse = {
      ok: true,
      memo,
      providerMetadata: {
        providerName: result.providerName,
        modelUsed: result.modelUsed,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
      warnings: [...extraWarnings, ...parsedMemo.warnings],
    };
    return c.json(body);
  } catch {
    console.log(
      JSON.stringify({
        event: "generate_unexpected_fail",
        provider: readiness.provider,
        model: readiness.model,
        errorType: "internal",
      }),
    );
    return c.json(
      buildSafeFailure(
        "provider_error",
        "Internal generation error.",
        readiness.provider,
        readiness.model,
      ),
    );
  }
});

// Phase 5D: per-section memo generation. The workspace orchestrates 9
// sequential calls to this endpoint instead of one big follow-up-memo call.
// Each call emits ONE MemoSection — small input, small output, well under
// the 60 s timeout. Per-section retry-compact is driven by the frontend
// orchestrator (the worker just honors the `retryCompact` flag in the body).
app.post("/api/generate/memo-section", async (c) => {
  const declaredLength = Number(c.req.header("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    return c.json({ error: "payload_too_large" }, 413);
  }
  let bodyText: string;
  try {
    bodyText = await c.req.raw.text();
  } catch {
    return c.json({ error: "body_unreadable" }, 400);
  }
  if (bodyText.length > MAX_BODY_BYTES) {
    return c.json({ error: "payload_too_large" }, 413);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const validation = validateGenerateSectionRequest(parsed);
  if (!validation.ok) {
    return c.json(
      { error: "invalid_request", message: validation.message },
      400,
    );
  }
  const sectionId = validation.value.sectionId;

  const readiness = evaluateLlmReadiness(c.env);
  if (!readiness.llmEnabled) {
    return c.json(
      buildSafeSectionFailure(
        "not_configured",
        "LLM generation is not enabled on this server.",
        sectionId,
      ),
    );
  }
  if (!readiness.providerConfigured) {
    return c.json(
      buildSafeSectionFailure(
        "provider_missing",
        "LLM provider is not configured.",
        sectionId,
        readiness.provider,
        readiness.model,
      ),
    );
  }
  if (!readiness.apiKeyConfigured) {
    return c.json(
      buildSafeSectionFailure(
        "api_key_missing",
        "LLM API key is not configured.",
        sectionId,
        readiness.provider,
        readiness.model,
      ),
    );
  }
  if (readiness.provider !== "openai") {
    return c.json(
      buildSafeSectionFailure(
        "provider_missing",
        "Section-by-section generation requires the OpenAI provider.",
        sectionId,
        readiness.provider,
        readiness.model,
      ),
    );
  }
  if (readiness.gateEnabled) {
    const gateResult = checkGateToken(c.env, c.req.header(GATE_HEADER));
    if (!gateResult.ok) {
      return c.json(
        buildSafeSectionFailure(
          gateResult.code,
          gateResult.message,
          sectionId,
          readiness.provider,
          readiness.model,
        ),
      );
    }
  }
  const apiKey = readEnvVar(c.env, "LLM_API_KEY") || readEnvVar(c.env, "OPENAI_API_KEY");
  if (!apiKey || !readiness.model) {
    return c.json(
      buildSafeSectionFailure(
        "not_configured",
        "LLM provider is not available.",
        sectionId,
        readiness.provider,
        readiness.model,
      ),
    );
  }

  try {
    const prompt = buildSectionPrompt(validation.value);
    const maxTokens = validation.value.retryCompact
      ? SECTION_COMPACT_MAX_OUTPUT_TOKENS[sectionId]
      : SECTION_MAX_OUTPUT_TOKENS[sectionId];

    console.log(
      JSON.stringify({
        event: "llm_generate_section_enter",
        sectionId,
        retryCompact: validation.value.retryCompact === true,
        systemLen: prompt.system.length,
        userLen: prompt.user.length,
        findings: validation.value.relevantFindings.length,
        maxTokens,
        model: readiness.model,
      }),
    );

    const ladder = await runSectionExtractRepairLadder({
      sectionId,
      allowedDocumentIds: prompt.allowedDocumentIds,
      normalCall: async (): Promise<SectionCallResult> => {
        const r = await callOpenAIResponses({
          apiKey,
          model: readiness.model!,
          system: prompt.system,
          user: prompt.user,
          schema: MEMO_SECTION_OPENAI_SCHEMA,
          schemaName: SECTION_FORMAT_NAME,
          maxTokens,
          abortSignal: c.req.raw.signal,
          logEventTag: "llm_generate_section",
        });
        if (r.ok) {
          return {
            ok: true,
            parsed: r.parsed,
            inputTokens: r.inputTokens,
            outputTokens: r.outputTokens,
          };
        }
        return {
          ok: false,
          code: r.code,
          message: r.message,
          rawText: r.rawText,
        };
      },
      repairCall: async (rawText: string): Promise<SectionCallResult> => {
        const r = await runSectionRepair({
          apiKey,
          model: readiness.model!,
          sectionId,
          rawText,
          schema: MEMO_SECTION_OPENAI_SCHEMA,
          schemaName: SECTION_FORMAT_NAME,
          abortSignal: c.req.raw.signal,
        });
        if (r.ok) {
          return {
            ok: true,
            parsed: r.parsed,
            inputTokens: r.inputTokens,
            outputTokens: r.outputTokens,
          };
        }
        return { ok: false, code: r.code, message: r.message };
      },
      log: (event) => {
        console.log(JSON.stringify({ event: "llm_generate_section_repair", ...event }));
      },
    });

    if (!ladder.ok) {
      const translated =
        ladder.code === "parse_error"
          ? "parse_error"
          : translateProviderCode(ladder.code);
      return c.json(
        buildSafeSectionFailure(
          translated,
          ladder.message,
          sectionId,
          "openai",
          readiness.model,
        ),
      );
    }

    const body: GenerateMemoSectionResponse = {
      ok: true,
      // Phase 5G: strip internal ids (r01/f01/local_initial_...) from the
      // visible prose fields before the section leaves the worker. The
      // structured sources[] (documentId/page/quote) are preserved intact.
      section: sanitizeMemoSectionForDisplay(ladder.section),
      providerMetadata: {
        providerName: "openai",
        modelUsed: readiness.model,
        inputTokens: ladder.inputTokens,
        outputTokens: ladder.outputTokens,
      },
      warnings: ladder.warnings,
    };
    return c.json(body);
  } catch {
    console.log(
      JSON.stringify({
        event: "generate_section_unexpected_fail",
        sectionId,
        provider: readiness.provider,
        model: readiness.model,
        errorType: "internal",
      }),
    );
    return c.json(
      buildSafeSectionFailure(
        "provider_error",
        "Internal generation error.",
        sectionId,
        readiness.provider,
        readiness.model,
      ),
    );
  }
});

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: "not_found", path: c.req.path }, 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

function buildSafeFailure(
  code: LlmGenerationErrorCode,
  message: string,
  providerName?: LlmProviderName,
  modelUsed?: string,
): GenerateFollowUpMemoResponse {
  return {
    ok: false,
    code,
    message,
    providerName,
    modelUsed,
    fallbackAvailable: true,
  };
}

function buildSafeSectionFailure(
  code: LlmGenerationErrorCode,
  message: string,
  sectionId: CanonicalSectionId,
  providerName?: LlmProviderName,
  modelUsed?: string,
): GenerateMemoSectionResponse {
  return {
    ok: false,
    code,
    message,
    providerName,
    modelUsed,
    sectionId,
  };
}

function readEnvVar(env: Env, key: string): string | undefined {
  const value = (env as unknown as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

type ProviderFailCode =
  | "llm_error"
  | "timeout"
  | "malformed_output"
  | "rate_limited"
  | "not_configured";

function translateProviderCode(code: ProviderFailCode): LlmGenerationErrorCode {
  switch (code) {
    case "llm_error":
      return "provider_error";
    case "malformed_output":
      return "parse_error";
    case "timeout":
      return "timeout";
    case "rate_limited":
      return "rate_limited";
    case "not_configured":
      return "not_configured";
  }
}

function clampMaxTokens(requested: number | undefined): number {
  if (
    typeof requested !== "number" ||
    !Number.isFinite(requested) ||
    requested <= 0
  ) {
    return DEFAULT_MAX_OUTPUT_TOKENS;
  }
  return Math.min(Math.floor(requested), HARD_MAX_OUTPUT_TOKENS);
}

type ValidationResult =
  | { ok: true; value: GenerateFollowUpMemoRequest }
  | { ok: false; message: string };

function validateGenerateRequest(input: unknown): ValidationResult {
  if (!isPlainObject(input)) return invalid("request must be an object");

  const project = input.project;
  if (!isPlainObject(project)) return invalid("project missing");
  if (typeof project.id !== "string") return invalid("project.id missing");
  if (typeof project.ticker !== "string")
    return invalid("project.ticker missing");
  if (typeof project.companyName !== "string")
    return invalid("project.companyName missing");

  const initialMemo = input.initialMemo;
  if (!isPlainObject(initialMemo)) return invalid("initialMemo missing");
  if (typeof initialMemo.text !== "string")
    return invalid("initialMemo.text missing");
  if (typeof initialMemo.sourceFilename !== "string")
    return invalid("initialMemo.sourceFilename missing");
  if (typeof initialMemo.sizeBytes !== "number")
    return invalid("initialMemo.sizeBytes missing");

  // updateDocs is optional in Phase 5 (the workspace flow no longer
  // collects update-pack uploads). If provided it must still be a
  // length-bounded array of well-shaped doc objects.
  if (input.updateDocs !== undefined) {
    const updateDocs = input.updateDocs;
    if (!Array.isArray(updateDocs))
      return invalid("updateDocs must be an array");
    if (updateDocs.length > MAX_UPDATE_DOCS)
      return invalid(`too many updateDocs (>${MAX_UPDATE_DOCS})`);
    for (const doc of updateDocs) {
      if (!isPlainObject(doc)) return invalid("updateDoc not an object");
      if (typeof doc.id !== "string") return invalid("updateDoc.id missing");
      if (typeof doc.kind !== "string")
        return invalid("updateDoc.kind missing");
      if (typeof doc.filename !== "string")
        return invalid("updateDoc.filename missing");
      if (typeof doc.text !== "string")
        return invalid("updateDoc.text missing");
    }
  }

  if (!isPlainObject(input.dna)) return invalid("dna missing");

  if (input.analysis !== undefined && !isPlainObject(input.analysis)) {
    return invalid("analysis must be an object when provided");
  }

  if (
    input.research !== undefined &&
    input.research !== null &&
    !isPlainObject(input.research)
  ) {
    return invalid("research must be an object or null when provided");
  }

  if (input.detection !== undefined && !isPlainObject(input.detection)) {
    return invalid("detection must be an object when provided");
  }

  return { ok: true, value: input as unknown as GenerateFollowUpMemoRequest };
}

function invalid(message: string): { ok: false; message: string } {
  return { ok: false, message };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type SectionValidationResult =
  | { ok: true; value: GenerateMemoSectionRequest }
  | { ok: false; message: string };

function validateGenerateSectionRequest(input: unknown): SectionValidationResult {
  if (!isPlainObject(input)) return invalid("request must be an object");
  const sectionId = input.sectionId;
  if (typeof sectionId !== "string") return invalid("sectionId missing");
  if (!(CANONICAL_SECTION_IDS as readonly string[]).includes(sectionId)) {
    return invalid(`sectionId is not a canonical section id: ${sectionId}`);
  }
  const project = input.project;
  if (!isPlainObject(project)) return invalid("project missing");
  if (typeof project.id !== "string") return invalid("project.id missing");
  if (typeof project.ticker !== "string")
    return invalid("project.ticker missing");
  if (typeof project.companyName !== "string")
    return invalid("project.companyName missing");
  if (!isPlainObject(input.dna)) return invalid("dna missing");
  if (input.detection !== undefined && !isPlainObject(input.detection)) {
    return invalid("detection must be an object when provided");
  }
  if (!Array.isArray(input.relevantFindings)) {
    return invalid("relevantFindings must be an array");
  }
  if (
    input.relevantCheckpointImpacts !== undefined &&
    !Array.isArray(input.relevantCheckpointImpacts)
  ) {
    return invalid(
      "relevantCheckpointImpacts must be an array when provided",
    );
  }
  if (
    input.priorSectionsDigest !== undefined &&
    !Array.isArray(input.priorSectionsDigest)
  ) {
    return invalid("priorSectionsDigest must be an array when provided");
  }
  return {
    ok: true,
    value: input as unknown as GenerateMemoSectionRequest,
  };
}

export default app;
