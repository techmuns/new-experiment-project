import type {
  LlmGenerateArgs,
  LlmGenerateResult,
  LlmProvider,
} from "./types";
import { combineWithTimeout, isTimeoutError } from "./abort";
import { FOLLOW_UP_MEMO_OPENAI_SCHEMA } from "./parse";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const FORMAT_NAME = "follow_up_memo";
const TIMEOUT_MS = 60_000;

interface OpenAIContentBlock {
  type: string;
  text?: string;
}

interface OpenAIOutputBlock {
  type: string;
  content?: OpenAIContentBlock[];
}

interface OpenAIResponse {
  status?: string;
  error?: { code?: string; message?: string } | null;
  output?: OpenAIOutputBlock[];
  output_text?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export function createOpenAIProvider(
  apiKey: string,
  model: string,
): LlmProvider {
  return {
    providerName: "openai",
    modelUsed: model,
    async generate(args: LlmGenerateArgs): Promise<LlmGenerateResult> {
      const { signal, clear } = combineWithTimeout(
        args.abortSignal,
        TIMEOUT_MS,
      );
      try {
        const body = {
          model,
          instructions: args.system,
          input: [
            {
              role: "user",
              content: [{ type: "input_text", text: args.user }],
            },
          ],
          max_output_tokens: args.maxTokens,
          text: {
            format: {
              type: "json_schema",
              name: FORMAT_NAME,
              strict: true,
              schema: FOLLOW_UP_MEMO_OPENAI_SCHEMA,
            },
          },
        };

        let res: Response;
        try {
          res = await fetch(OPENAI_URL, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
            signal,
          });
        } catch (err) {
          const aborted = signal.aborted;
          const timeout = isTimeoutError(err);
          if (aborted) {
            logFailure(model, timeout ? "timeout" : "abort");
            return {
              ok: false,
              code: timeout ? "timeout" : "llm_error",
              message: timeout
                ? "LLM request timed out"
                : "LLM request was aborted",
              providerName: "openai",
              modelUsed: model,
            };
          }
          logFailure(model, "network");
          return {
            ok: false,
            code: "llm_error",
            message: err instanceof Error ? err.message : "Network error",
            providerName: "openai",
            modelUsed: model,
          };
        }

        if (res.status === 401) {
          logFailure(model, "unauthorized");
          return {
            ok: false,
            code: "not_configured",
            message: "Provider rejected the API key",
            providerName: "openai",
            modelUsed: model,
          };
        }
        if (res.status === 429) {
          logFailure(model, "rate_limited");
          return {
            ok: false,
            code: "rate_limited",
            message: "Provider rate limit",
            providerName: "openai",
            modelUsed: model,
          };
        }
        if (!res.ok) {
          logFailure(model, `http_${res.status}`);
          return {
            ok: false,
            code: "llm_error",
            message: `Provider returned HTTP ${res.status}`,
            providerName: "openai",
            modelUsed: model,
          };
        }

        let payload: OpenAIResponse;
        try {
          payload = (await res.json()) as OpenAIResponse;
        } catch {
          logFailure(model, "json_parse");
          return {
            ok: false,
            code: "malformed_output",
            message: "Provider response was not valid JSON",
            providerName: "openai",
            modelUsed: model,
          };
        }

        if (payload.status === "failed") {
          logFailure(model, "response_failed");
          return {
            ok: false,
            code: "llm_error",
            message: payload.error?.message ?? "Provider response failed",
            providerName: "openai",
            modelUsed: model,
          };
        }

        if (hasRefusal(payload.output)) {
          logFailure(model, "refusal");
          return {
            ok: false,
            code: "malformed_output",
            message: "Provider refused the request",
            providerName: "openai",
            modelUsed: model,
          };
        }

        const text = extractOutputText(payload);
        if (!text) {
          logFailure(model, "no_output");
          return {
            ok: false,
            code: "malformed_output",
            message: "Provider response had no output_text",
            providerName: "openai",
            modelUsed: model,
          };
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          logFailure(model, "output_parse");
          return {
            ok: false,
            code: "malformed_output",
            message: "Provider output_text was not valid JSON",
            providerName: "openai",
            modelUsed: model,
          };
        }

        const normalized = normalizeNulls(parsed);

        const inputTokens = payload.usage?.input_tokens;
        const outputTokens = payload.usage?.output_tokens;
        console.log(
          JSON.stringify({
            event: "llm_generate_ok",
            provider: "openai",
            model,
            inputTokens,
            outputTokens,
          }),
        );
        return {
          ok: true,
          json: normalized,
          providerName: "openai",
          modelUsed: model,
          inputTokens,
          outputTokens,
        };
      } finally {
        clear();
      }
    },
  };
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

function extractOutputText(payload: OpenAIResponse): string {
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

// Strip nulls on the known nullable fields so result.json mirrors the
// "absent = undefined" shape produced by Anthropic's tool_use.
function normalizeNulls(input: unknown): unknown {
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

function logFailure(model: string, errorType: string): void {
  console.log(
    JSON.stringify({
      event: "llm_generate_fail",
      provider: "openai",
      model,
      errorType,
    }),
  );
}
