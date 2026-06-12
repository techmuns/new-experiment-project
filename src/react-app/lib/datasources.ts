/**
 * Munshot datasource registry client.
 *
 * Pillar #3 ("datasource knowledge"): the dashboard ships with every
 * registered Munshot datasource pre-wired — base URLs, endpoint paths,
 * auth, timeouts, retry/backoff, and cache TTLs all come from the skill's
 * generated registry block, so dashboard code calls a typed method instead
 * of hand-rolling fetches or hardcoding URLs.
 *
 * Auth is host-owned: every call attaches the bearer JWT provided by the
 * Munshot SDK (no keys/secrets live in the dashboard). HTTPS only.
 */

export const BASE_URLS = {
  fastapi: "https://fastapi.muns.io",
  nestjs: "https://devde.muns.io",
} as const;

type Service = keyof typeof BASE_URLS;

/** Auth + retry defaults from the registry's `auth_defaults`. */
const DEFAULTS = {
  timeoutSeconds: 30,
  retryAttempts: 3,
  retryBackoffFactor: 2.0,
};

/** Static descriptor for each registered datasource (for introspection/UI). */
export interface DatasourceDescriptor {
  id: string;
  name: string;
  description: string;
  service: Service;
  method: "POST";
  path: string;
  rateLimitPerMinute: number;
  cacheTtlSeconds: number;
  streaming: boolean;
}

export const DATASOURCES: Record<string, DatasourceDescriptor> = {
  web_search: {
    id: "web_search",
    name: "Web Search",
    description: "Search the public internet using Brave Search.",
    service: "fastapi",
    method: "POST",
    path: "/tools/web-search",
    rateLimitPerMinute: 60,
    cacheTtlSeconds: 300,
    streaming: false,
  },
  web_reader: {
    id: "web_reader",
    name: "Web Reader",
    description: "Read and extract content from one or more URLs.",
    service: "fastapi",
    method: "POST",
    path: "/tools/web-reader",
    rateLimitPerMinute: 60,
    cacheTtlSeconds: 300,
    streaming: false,
  },
  news_search: {
    id: "news_search",
    name: "News Search",
    description: "Search recent news articles.",
    service: "fastapi",
    method: "POST",
    path: "/tools/news-search",
    rateLimitPerMinute: 60,
    cacheTtlSeconds: 180,
    streaming: false,
  },
  document_search: {
    id: "document_search",
    name: "Document Search",
    description: "Search proprietary documents indexed in Pinecone.",
    service: "fastapi",
    method: "POST",
    path: "/tools/document-search",
    rateLimitPerMinute: 60,
    cacheTtlSeconds: 120,
    streaming: false,
  },
  muns_chat: {
    id: "muns_chat",
    name: "Muns Chat",
    description:
      "Stream an AI answer using Muns chat context, documents, tickers, and dashboard inputs.",
    service: "nestjs",
    method: "POST",
    path: "/chat/chat-muns",
    rateLimitPerMinute: 30,
    cacheTtlSeconds: 0,
    streaming: true,
  },
  agent_run: {
    id: "agent_run",
    name: "Agent Run",
    description: "Run a registered analyst agent and stream its output.",
    service: "nestjs",
    method: "POST",
    path: "/agents/run",
    rateLimitPerMinute: 20,
    cacheTtlSeconds: 0,
    streaming: true,
  },
};

export class DatasourceError extends Error {
  constructor(
    message: string,
    readonly code:
      | "auth_missing"
      | "http_error"
      | "network_error"
      | "timeout"
      | "aborted",
    readonly status?: number,
  ) {
    super(message);
    this.name = "DatasourceError";
  }
}

/* ---------- request / response field types ---------- */

export interface WebSearchRequest {
  query: string;
  country?: string;
}
export interface WebReaderRequest {
  urls: string[];
  task?: string;
}
export interface NewsSearchRequest {
  query: string;
  country?: string;
  from_date?: string;
  to_date?: string;
}
export interface DocumentSearchRequest {
  query: string;
  user_index: number;
  ticker_symbol?: string | string[];
  from_date?: string;
  to_date?: string;
  categories?: string[];
  doc_indexes?: string[];
}
export interface DocumentSearchResponse {
  structured_data: unknown[];
  citations?: unknown[];
}

/** Dashboard inputs forwarded so chat/agent answers are grounded in the
 *  exact filters/tabs the user had open (pillar #4 — status tracking). */
export interface DashboardInput {
  key: string;
  label?: string;
  value: unknown;
}

export interface MunsChatRequest {
  tasks: string[];
  chatHistory?: unknown[];
  tickerSymbols?: string[];
  fromDate?: string;
  toDate?: string;
  documentIds?: string[];
  docIndex?: number[];
  dashboardInputs?: DashboardInput[];
  mode?: "fast" | "expert";
  chatId?: string;
}

export interface AgentRunRequest {
  agentId?: string;
  agentLibraryId?: string;
  userQuery?: string;
  metadata?: Record<string, unknown>;
  dashboardInputs?: DashboardInput[];
  categories?: string[];
  writingStyles?: string[];
}

/** A single streamed chunk plus the response headers from an SSE call. */
export interface StreamHandle {
  stream: AsyncIterable<string>;
  headers: Headers;
}

type TokenProvider = () => string | undefined;

export function createDatasourceClient(getToken: TokenProvider) {
  function url(service: Service, path: string): string {
    return `${BASE_URLS[service]}${path}`;
  }

  function authHeaders(): Record<string, string> {
    const token = getToken();
    if (!token) {
      throw new DatasourceError(
        "No host session token available — the dashboard must be opened inside Munshot.",
        "auth_missing",
      );
    }
    return { authorization: `Bearer ${token}` };
  }

  /** POST a JSON body with timeout + bounded retry/backoff. */
  async function postJson<TResp>(
    service: Service,
    path: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<TResp> {
    const headers = {
      "content-type": "application/json",
      accept: "application/json",
      ...authHeaders(),
    };
    let attempt = 0;
    let lastErr: unknown;
    while (attempt <= DEFAULTS.retryAttempts) {
      try {
        const res = await withTimeout(
          (timeoutSignal) =>
            fetch(url(service, path), {
              method: "POST",
              headers,
              body: JSON.stringify(body),
              signal: mergeSignals(signal, timeoutSignal),
            }),
          signal,
        );
        if (!res.ok) {
          // Retry only transient (5xx); surface 4xx immediately.
          if (res.status >= 500 && attempt < DEFAULTS.retryAttempts) {
            throw new DatasourceError(
              `${path} → ${res.status}`,
              "http_error",
              res.status,
            );
          }
          throw new DatasourceError(
            `${path} → ${res.status} ${res.statusText}`,
            "http_error",
            res.status,
          );
        }
        return (await res.json()) as TResp;
      } catch (err) {
        lastErr = err;
        if (isAbort(err)) throw new DatasourceError("Aborted", "aborted");
        const transient =
          err instanceof DatasourceError
            ? err.code === "http_error" && (err.status ?? 0) >= 500
            : true; // network errors are transient
        if (!transient || attempt >= DEFAULTS.retryAttempts) break;
        await backoff(attempt);
        attempt += 1;
      }
    }
    if (lastErr instanceof DatasourceError) throw lastErr;
    throw new DatasourceError(
      lastErr instanceof Error ? lastErr.message : "Network error",
      "network_error",
    );
  }

  /** POST and stream a text/event-stream response (chat/agent). */
  async function postStream(
    service: Service,
    path: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<StreamHandle> {
    const res = await fetch(url(service, path), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
        ...authHeaders(),
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok || !res.body) {
      throw new DatasourceError(
        `${path} → ${res.status} ${res.statusText}`,
        "http_error",
        res.status,
      );
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    async function* iterate(): AsyncIterable<string> {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          yield decoder.decode(value, { stream: true });
        }
      } finally {
        reader.releaseLock();
      }
    }
    return { stream: iterate(), headers: res.headers };
  }

  return {
    descriptors: DATASOURCES,

    webSearch: (req: WebSearchRequest, signal?: AbortSignal) =>
      postJson<{ results: unknown[] }>(
        "fastapi",
        DATASOURCES.web_search.path,
        req,
        signal,
      ),

    webReader: (req: WebReaderRequest, signal?: AbortSignal) =>
      postJson<{ results: Record<string, unknown> }>(
        "fastapi",
        DATASOURCES.web_reader.path,
        req,
        signal,
      ),

    newsSearch: (req: NewsSearchRequest, signal?: AbortSignal) =>
      postJson<{ results: unknown[] }>(
        "fastapi",
        DATASOURCES.news_search.path,
        req,
        signal,
      ),

    documentSearch: (req: DocumentSearchRequest, signal?: AbortSignal) =>
      postJson<DocumentSearchResponse>(
        "fastapi",
        DATASOURCES.document_search.path,
        req,
        signal,
      ),

    munsChat: (req: MunsChatRequest, signal?: AbortSignal) =>
      postStream(
        "nestjs",
        DATASOURCES.muns_chat.path,
        {
          tasks: req.tasks,
          query_context: {
            chatHistory: req.chatHistory ?? [],
            TICKER_SYMBOL: req.tickerSymbols,
            FROM_DATE: req.fromDate,
            TO_DATE: req.toDate,
            DOCUMENT_IDS: req.documentIds,
            DOC_INDEX: req.docIndex,
            DASHBOARD_INPUTS: req.dashboardInputs,
            mode: req.mode ?? "expert",
          },
          chat_id: req.chatId,
        },
        signal,
      ),

    agentRun: (req: AgentRunRequest, signal?: AbortSignal) =>
      postStream(
        "nestjs",
        DATASOURCES.agent_run.path,
        {
          agent_id: req.agentId,
          agent_library_id: req.agentLibraryId,
          user_query: req.userQuery,
          metadata: req.metadata,
          DASHBOARD_INPUTS: req.dashboardInputs,
          CATEGORIES: req.categories,
          WRITING_STYLES: req.writingStyles,
        },
        signal,
      ),
  };
}

export type DatasourceClient = ReturnType<typeof createDatasourceClient>;

/* ---------- helpers ---------- */

function backoff(attempt: number): Promise<void> {
  const ms = 1000 * Math.pow(DEFAULTS.retryBackoffFactor, attempt);
  return new Promise((r) => setTimeout(r, ms));
}

function isAbort(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof DatasourceError && err.code === "aborted")
  );
}

/** Run a fetch with the registry timeout; aborts via a dedicated signal. */
async function withTimeout(
  run: (timeoutSignal: AbortSignal) => Promise<Response>,
  external?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    DEFAULTS.timeoutSeconds * 1000,
  );
  const onExternalAbort = () => controller.abort();
  external?.addEventListener("abort", onExternalAbort);
  try {
    return await run(controller.signal);
  } catch (err) {
    if (controller.signal.aborted && !external?.aborted) {
      throw new DatasourceError("Request timed out", "timeout");
    }
    throw err;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", onExternalAbort);
  }
}

/** Combine an optional external signal with the timeout signal. */
function mergeSignals(
  external: AbortSignal | undefined,
  timeout: AbortSignal,
): AbortSignal {
  if (!external) return timeout;
  if (typeof AbortSignal !== "undefined" && "any" in AbortSignal) {
    return (AbortSignal as unknown as { any: (s: AbortSignal[]) => AbortSignal }).any([
      external,
      timeout,
    ]);
  }
  return timeout;
}
