import type {
  LlmGenerateArgs,
  LlmGenerateFailCode,
  LlmGenerateResult,
  LlmProvider,
} from "./types";
import { combineWithTimeout, isTimeoutError } from "./abort";
import { FOLLOW_UP_MEMO_OPENAI_SCHEMA } from "./parse";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const MEMO_FORMAT_NAME = "follow_up_memo";
const TIMEOUT_MS = 60_000;

interface OpenAIContentBlock {
  type: string;
  text?: string;
}

interface WebSearchSourceBlock {
  url?: string;
  title?: string;
  date?: string;
  snippet?: string;
}

interface OpenAIOutputBlock {
  type: string;
  content?: OpenAIContentBlock[];
  action?: { sources?: WebSearchSourceBlock[] };
}

export interface OpenAIResponsePayload {
  status?: string;
  error?: { code?: string; message?: string } | null;
  output?: OpenAIOutputBlock[];
  output_text?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export interface CallOpenAIResponsesArgs {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  schema: object;
  schemaName: string;
  tools?: Array<Record<string, unknown>>;
  maxTokens?: number;
  abortSignal?: AbortSignal;
  logEventTag?: string;
}

export type CallOpenAIResponsesResult =
  | {
      ok: true;
      payload: OpenAIResponsePayload;
      parsed: unknown;
      inputTokens?: number;
      outputTokens?: number;
    }
  | {
      ok: false;
      code: LlmGenerateFailCode;
      message: string;
    };

// Shared low-level call to the OpenAI Responses API. Used by the memo
// provider (createOpenAIProvider below) and by the research route, which
// passes a different schema + a web_search tool and walks `payload.output`
// for web_search_call source metadata. Never logs prompts, output text,
// the API key, or any user secrets.
export async function callOpenAIResponses(
  args: CallOpenAIResponsesArgs,
): Promise<CallOpenAIResponsesResult> {
  const { signal, clear } = combineWithTimeout(args.abortSignal, TIMEOUT_MS);
  const eventTag = args.logEventTag ?? "llm_generate";
  try {
    const body: Record<string, unknown> = {
      model: args.model,
      instructions: args.system,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: args.user }],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: args.schemaName,
          strict: true,
          schema: args.schema,
        },
      },
    };
    if (typeof args.maxTokens === "number" && args.maxTokens > 0) {
      body.max_output_tokens = args.maxTokens;
    }
    if (args.tools && args.tools.length > 0) {
      body.tools = args.tools;
    }

    let res: Response;
    try {
      res = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${args.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      const aborted = signal.aborted;
      const timeout = isTimeoutError(err);
      if (aborted) {
        logFailure(eventTag, args.model, timeout ? "timeout" : "abort");
        return {
          ok: false,
          code: timeout ? "timeout" : "llm_error",
          message: timeout
            ? "LLM request timed out"
            : "LLM request was aborted",
        };
      }
      logFailure(eventTag, args.model, "network");
      return {
        ok: false,
        code: "llm_error",
        message: err instanceof Error ? err.message : "Network error",
      };
    }

    if (res.status === 401) {
      logFailure(eventTag, args.model, "unauthorized");
      return {
        ok: false,
        code: "not_configured",
        message: "Provider rejected the API key",
      };
    }
    if (res.status === 429) {
      logFailure(eventTag, args.model, "rate_limited");
      return {
        ok: false,
        code: "rate_limited",
        message: "Provider rate limit",
      };
    }
    if (!res.ok) {
      logFailure(eventTag, args.model, `http_${res.status}`);
      return {
        ok: false,
        code: "llm_error",
        message: `Provider returned HTTP ${res.status}`,
      };
    }

    let payload: OpenAIResponsePayload;
    try {
      payload = (await res.json()) as OpenAIResponsePayload;
    } catch {
      logFailure(eventTag, args.model, "json_parse");
      return {
        ok: false,
        code: "malformed_output",
        message: "Provider response was not valid JSON",
      };
    }

    if (payload.status === "failed") {
      logFailure(eventTag, args.model, "response_failed");
      return {
        ok: false,
        code: "llm_error",
        message: payload.error?.message ?? "Provider response failed",
      };
    }

    if (hasRefusal(payload.output)) {
      logFailure(eventTag, args.model, "refusal");
      return {
        ok: false,
        code: "malformed_output",
        message: "Provider refused the request",
      };
    }

    const text = extractOutputText(payload);
    if (!text) {
      logFailure(eventTag, args.model, "no_output");
      return {
        ok: false,
        code: "malformed_output",
        message: "Provider response had no output_text",
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      logFailure(eventTag, args.model, "output_parse");
      return {
        ok: false,
        code: "malformed_output",
        message: "Provider output_text was not valid JSON",
      };
    }

    const inputTokens = payload.usage?.input_tokens;
    const outputTokens = payload.usage?.output_tokens;
    console.log(
      JSON.stringify({
        event: `${eventTag}_ok`,
        provider: "openai",
        model: args.model,
        inputTokens,
        outputTokens,
      }),
    );
    return {
      ok: true,
      payload,
      parsed,
      inputTokens,
      outputTokens,
    };
  } finally {
    clear();
  }
}

export function createOpenAIProvider(
  apiKey: string,
  model: string,
): LlmProvider {
  return {
    providerName: "openai",
    modelUsed: model,
    async generate(args: LlmGenerateArgs): Promise<LlmGenerateResult> {
      const result = await callOpenAIResponses({
        apiKey,
        model,
        system: args.system,
        user: args.user,
        schema: FOLLOW_UP_MEMO_OPENAI_SCHEMA,
        schemaName: MEMO_FORMAT_NAME,
        maxTokens: args.maxTokens,
        abortSignal: args.abortSignal,
        logEventTag: "llm_generate",
      });
      if (!result.ok) {
        return {
          ok: false,
          code: result.code,
          message: result.message,
          providerName: "openai",
          modelUsed: model,
        };
      }
      return {
        ok: true,
        json: normalizeMemoNulls(result.parsed),
        providerName: "openai",
        modelUsed: model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      };
    },
  };
}

// Harvest web_search_call action.sources from the raw Responses-API
// payload. Returns a map keyed by URL so the research route can mark
// model-emitted finding sources as verified-by-tool and enrich
// title/date when the model omitted them. Empty when the response
// shape doesn't include web_search blocks.
export function extractWebSearchSources(
  payload: OpenAIResponsePayload,
): Map<string, { title?: string; date?: string }> {
  const map = new Map<string, { title?: string; date?: string }>();
  for (const block of payload.output ?? []) {
    if (block.type !== "web_search_call") continue;
    const sources = block.action?.sources ?? [];
    for (const src of sources) {
      if (typeof src.url !== "string" || src.url.length === 0) continue;
      const existing = map.get(src.url);
      map.set(src.url, {
        title: existing?.title ?? src.title,
        date: existing?.date ?? src.date,
      });
    }
  }
  return map;
}

function hasRefusal(output: OpenAIOutputBlock[] | undefined): boolean {
  if (!output) return false;
  for (const block of output) {
    if (block.type === "refusal") return true;
    for (const c of block.content ?? []) {
      if (c.type === "refusal") return true;
    }
  }
  return false;
}

function extractOutputText(payload: OpenAIResponsePayload): string {
  if (
    typeof payload.output_text === "string" &&
    payload.output_text.length > 0
  ) {
    return payload.output_text;
  }
  const parts: string[] = [];
  for (const block of payload.output ?? []) {
    for (const c of block.content ?? []) {
      if (c.type === "output_text" && typeof c.text === "string") {
        parts.push(c.text);
      }
    }
  }
  return parts.join("");
}

// Strip nulls on the known nullable fields of the memo schema so result.json
// mirrors the "absent = undefined" shape produced by Anthropic's tool_use.
function normalizeMemoNulls(input: unknown): unknown {
  if (!isPlainObject(input)) return input;
  const sections = input.sections;
  if (!Array.isArray(sections)) return input;
  const cleanSections = sections.map((s) => {
    if (!isPlainObject(s)) return s;
    const copy: Record<string, unknown> = { ...s };
    if (copy.confidenceNote === null) delete copy.confidenceNote;
    const sources = copy.sources;
    if (Array.isArray(sources)) {
      copy.sources = sources.map((src) => {
        if (!isPlainObject(src)) return src;
        const sc: Record<string, unknown> = { ...src };
        if (sc.page === null) delete sc.page;
        if (sc.quote === null) delete sc.quote;
        return sc;
      });
    }
    return copy;
  });
  return { ...input, sections: cleanSections };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function logFailure(
  eventTag: string,
  model: string,
  errorType: string,
): void {
  console.log(
    JSON.stringify({
      event: `${eventTag}_fail`,
      provider: "openai",
      model,
      errorType,
    }),
  );
}
