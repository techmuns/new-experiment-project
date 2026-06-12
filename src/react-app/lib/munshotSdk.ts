/**
 * Munshot Dashboard SDK adapter.
 *
 * Per the dashboard-builder skill, every dashboard is embedded inside the
 * Munshot host as an iframe and must NOT implement its own auth or custom
 * postMessage wiring. The host owns login, sessions, and token lifecycle;
 * the dashboard consumes user/org/session context and a bearer token from
 * the SDK and reacts to host context updates without a page refresh.
 *
 * The SDK script (loaded in index.html) exposes a window-level global. The
 * exact global name / surface can vary between SDK builds, so this module is
 * a defensive adapter: it discovers whichever global is present, maps it to
 * a stable typed interface, and degrades to a "standalone" mode when no SDK
 * is found (e.g. local `vite dev` outside the Munshot shell) so the
 * dashboard still renders its empty/error states rather than crashing.
 */

/** User identity supplied by the host. */
export interface HostUser {
  id?: string;
  name?: string;
  email?: string;
  /** Pinecone / proprietary document index for this user (document_search). */
  userIndex?: number;
}

export interface HostOrg {
  id?: string;
  name?: string;
}

export interface HostSession {
  /** Bearer JWT used to authenticate datasource calls. */
  token?: string;
  expiresAt?: string;
}

/**
 * Full host context. Everything is optional because the host may push it
 * incrementally (identity first, then the active selection) and because in
 * standalone mode none of it is present.
 */
export interface HostContext {
  user?: HostUser;
  org?: HostOrg;
  session?: HostSession;
  /** Active ticker / symbol selected in the host product. */
  ticker?: string;
  company?: string;
  /** Active host-level filters (date range, categories, segments, …). */
  filters?: Record<string, unknown>;
  /** Host navigation / app state, e.g. which host tab is active. */
  navigation?: Record<string, unknown>;
}

export type SdkStatus = "connecting" | "ready" | "error" | "standalone";

export interface SdkMetadata {
  id: string;
  name: string;
  version: string;
  /** Topics this dashboard publishes/subscribes, for host registration. */
  capabilities?: string[];
}

/** Stable interface the rest of the app codes against. */
export interface MunshotSdk {
  status: SdkStatus;
  /** Best-effort current context snapshot. */
  getContext(): HostContext;
  /** Subscribe to context updates. Returns an unsubscribe fn. */
  onContext(handler: (ctx: HostContext) => void): () => void;
  /** Subscribe to status changes (connecting → ready/error/standalone). */
  onStatus(handler: (status: SdkStatus) => void): () => void;
  /** Request a fresh context snapshot from the host (request/response). */
  requestContext(): Promise<HostContext>;
  /** Publish a namespaced pub/sub event to the host. */
  publish(topic: string, payload?: unknown): void;
  /** Tear down listeners and signal disconnect to the host. */
  disconnect(): void;
}

/* --------------------------------------------------------------------------
   Raw SDK discovery. We try a few likely global shapes without assuming a
   single one, then normalize. Each candidate may be either a factory/class
   (called/constructed with config) or a ready object exposing init/connect.
-------------------------------------------------------------------------- */

type RawHandler = (payload: unknown) => void;

interface RawSdkLike {
  init?: (config?: unknown) => unknown;
  connect?: (config?: unknown) => unknown;
  ready?: () => unknown;
  register?: (meta?: unknown) => unknown;
  registerDashboard?: (meta?: unknown) => unknown;
  getContext?: () => unknown;
  requestContext?: () => Promise<unknown> | unknown;
  request?: (topic: string, payload?: unknown) => Promise<unknown> | unknown;
  subscribe?: (topic: string, handler: RawHandler) => unknown;
  on?: (topic: string, handler: RawHandler) => unknown;
  off?: (topic: string, handler: RawHandler) => unknown;
  publish?: (topic: string, payload?: unknown) => unknown;
  emit?: (topic: string, payload?: unknown) => unknown;
  disconnect?: () => unknown;
  destroy?: () => unknown;
}

const GLOBAL_CANDIDATES = [
  "MunshotDashboardSDK",
  "MunshotDashboard",
  "MunshotSDK",
  "munshotDashboard",
  "munshot",
] as const;

function discoverRawSdk(meta: SdkMetadata): RawSdkLike | null {
  const w = window as unknown as Record<string, unknown>;
  for (const key of GLOBAL_CANDIDATES) {
    const candidate = w[key];
    if (!candidate) continue;
    try {
      // Factory or class — instantiate with our metadata as config.
      if (typeof candidate === "function") {
        const config = { id: meta.id, name: meta.name, version: meta.version };
        let instance: unknown;
        try {
          instance = new (candidate as new (c: unknown) => unknown)(config);
        } catch {
          instance = (candidate as (c: unknown) => unknown)(config);
        }
        if (instance && typeof instance === "object") {
          return instance as RawSdkLike;
        }
      }
      // Already an object exposing SDK methods.
      if (typeof candidate === "object") {
        return candidate as RawSdkLike;
      }
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */

function isPromise(v: unknown): v is Promise<unknown> {
  return Boolean(v) && typeof (v as Promise<unknown>).then === "function";
}

/** Normalize an arbitrary host context payload into our HostContext shape. */
function normalizeContext(raw: unknown, prev: HostContext): HostContext {
  if (!raw || typeof raw !== "object") return prev;
  const r = raw as Record<string, unknown>;
  const user = (r.user ?? r.currentUser) as Record<string, unknown> | undefined;
  const org = (r.org ?? r.organization) as Record<string, unknown> | undefined;
  const session = (r.session ?? r.auth) as Record<string, unknown> | undefined;

  const next: HostContext = { ...prev };

  if (user) {
    next.user = {
      id: str(user.id ?? user.userId),
      name: str(user.name ?? user.fullName),
      email: str(user.email),
      userIndex: num(user.userIndex ?? user.user_index ?? user.index),
    };
  }
  if (org) {
    next.org = { id: str(org.id), name: str(org.name) };
  }
  if (session) {
    next.session = {
      token: str(session.token ?? session.accessToken ?? session.jwt),
      expiresAt: str(session.expiresAt ?? session.expires_at),
    };
  }
  const ticker = r.ticker ?? r.symbol ?? r.selectedTicker;
  if (typeof ticker === "string") next.ticker = ticker;
  const company = r.company ?? r.companyName;
  if (typeof company === "string") next.company = company;
  if (r.filters && typeof r.filters === "object") {
    next.filters = r.filters as Record<string, unknown>;
  }
  if (r.navigation && typeof r.navigation === "object") {
    next.navigation = r.navigation as Record<string, unknown>;
  }
  return next;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/* Host → dashboard context topics we listen on (namespaced, per skill). */
const CONTEXT_TOPICS = [
  "host.context",
  "host.context.update",
  "portfolio.ticker.select",
  "analytics.filter.change",
  "host.navigation",
];

/**
 * Initialize the SDK and run the required lifecycle:
 *   load → init → register metadata → ready → request context → subscribe.
 * Always resolves to a usable MunshotSdk; on any failure it returns a
 * standalone implementation so the UI can render its non-embedded states.
 */
export function initMunshotSdk(meta: SdkMetadata): MunshotSdk {
  let status: SdkStatus = "connecting";
  let context: HostContext = {};
  const ctxHandlers = new Set<(ctx: HostContext) => void>();
  const statusHandlers = new Set<(s: SdkStatus) => void>();
  const teardown: Array<() => void> = [];

  const setStatus = (s: SdkStatus) => {
    status = s;
    statusHandlers.forEach((h) => h(s));
  };
  const setContext = (raw: unknown) => {
    context = normalizeContext(raw, context);
    ctxHandlers.forEach((h) => h(context));
  };

  const raw = discoverRawSdk(meta);

  // No SDK present (local dev / not embedded): standalone mode.
  if (!raw) {
    setStatus("standalone");
    return {
      get status() {
        return status;
      },
      getContext: () => context,
      onContext: (h) => {
        ctxHandlers.add(h);
        return () => ctxHandlers.delete(h);
      },
      onStatus: (h) => {
        statusHandlers.add(h);
        return () => statusHandlers.delete(h);
      },
      requestContext: async () => context,
      publish: () => {},
      disconnect: () => {
        ctxHandlers.clear();
        statusHandlers.clear();
      },
    };
  }

  const subscribe = (topic: string, handler: RawHandler) => {
    const fn = raw.subscribe ?? raw.on;
    if (!fn) return;
    try {
      fn.call(raw, topic, handler);
      const off = raw.off;
      if (off) teardown.push(() => off.call(raw, topic, handler));
    } catch {
      /* ignore individual topic failures */
    }
  };

  const publish = (topic: string, payload?: unknown) => {
    const fn = raw.publish ?? raw.emit;
    if (!fn) return;
    try {
      fn.call(raw, topic, payload);
    } catch {
      /* non-fatal */
    }
  };

  // Drive the lifecycle. Wrapped so a throwing/rejecting host marks the
  // dashboard as errored instead of crashing it.
  void (async () => {
    try {
      // 1–2. init / connect
      const initFn = raw.init ?? raw.connect;
      if (initFn) {
        const res = initFn.call(raw, {
          id: meta.id,
          name: meta.name,
          version: meta.version,
        });
        if (isPromise(res)) await res;
      }
      // 3. register metadata
      const registerFn = raw.register ?? raw.registerDashboard;
      if (registerFn) {
        const res = registerFn.call(raw, meta);
        if (isPromise(res)) await res;
      }
      // 4. signal readiness
      if (raw.ready) {
        const res = raw.ready.call(raw);
        if (isPromise(res)) await res;
      }
      // 6. subscribe to host context updates
      for (const topic of CONTEXT_TOPICS) {
        subscribe(topic, (payload) => setContext(payload));
      }
      // 5. request initial host context
      let initial: unknown;
      if (raw.requestContext) {
        initial = raw.requestContext.call(raw);
      } else if (raw.request) {
        initial = raw.request.call(raw, "host.context");
      } else if (raw.getContext) {
        initial = raw.getContext.call(raw);
      }
      if (isPromise(initial)) initial = await initial;
      if (initial) setContext(initial);

      setStatus("ready");
    } catch {
      // 7. handle SDK init failure / disconnect.
      setStatus("error");
    }
  })();

  return {
    get status() {
      return status;
    },
    getContext: () => context,
    onContext: (h) => {
      ctxHandlers.add(h);
      return () => ctxHandlers.delete(h);
    },
    onStatus: (h) => {
      statusHandlers.add(h);
      return () => statusHandlers.delete(h);
    },
    requestContext: async () => {
      try {
        const fn = raw.requestContext
          ? raw.requestContext.bind(raw)
          : raw.request
            ? () => raw.request!.call(raw, "host.context")
            : raw.getContext
              ? raw.getContext.bind(raw)
              : null;
        if (!fn) return context;
        let res: unknown = fn();
        if (isPromise(res)) res = await res;
        if (res) setContext(res);
      } catch {
        /* keep last-known context */
      }
      return context;
    },
    publish,
    disconnect: () => {
      teardown.forEach((fn) => {
        try {
          fn();
        } catch {
          /* ignore */
        }
      });
      teardown.length = 0;
      try {
        (raw.disconnect ?? raw.destroy)?.call(raw);
      } catch {
        /* ignore */
      }
      ctxHandlers.clear();
      statusHandlers.clear();
    },
  };
}
