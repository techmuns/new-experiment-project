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
  GenerateFollowUpMemoRequest,
  GenerateFollowUpMemoResponse,
  HealthResponse,
  LlmGenerationErrorCode,
  LlmProviderName,
  LlmStatusResponse,
} from "@shared/types";
import {
  checkGateToken,
  evaluateLlmReadiness,
  getProvider,
} from "./llm/provider";
import { buildPrompt } from "./llm/prompt";
import { FOLLOW_UP_MEMO_TOOL_SCHEMA, parseLlmJson } from "./llm/parse";
import { trimRequestBody } from "./llm/trim";
import { handleResearchUpdates } from "./research/route";

const app = new Hono<{ Bindings: Env }>();

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_OUTPUT_TOKENS = 8000;
const HARD_MAX_OUTPUT_TOKENS = 12_000;
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

  const request = trimRequestBody(validation.value);
  const maxTokens = clampMaxTokens(request.generationOptions?.maxTokens);

  // Wrap the post-validation pipeline in a try/catch so any unexpected
  // error becomes a graceful provider_error rather than HTTP 500 — the
  // client can then fall back to the demo memo or "Generate without
  // research" path. Never logs the underlying error message (may contain
  // user payload).
  try {
    const { system, user, jsonSchema } = buildPrompt(
      request,
      FOLLOW_UP_MEMO_TOOL_SCHEMA,
    );

    const result = await provider.generate({
      system,
      user,
      jsonSchema,
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

    const body: GenerateFollowUpMemoResponse = {
      ok: true,
      memo: parsedMemo.memo,
      providerMetadata: {
        providerName: result.providerName,
        modelUsed: result.modelUsed,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
      warnings: parsedMemo.warnings,
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

export default app;
