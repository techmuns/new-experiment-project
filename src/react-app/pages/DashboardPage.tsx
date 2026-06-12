import { useMemo, useRef, useState } from "react";
import {
  Download,
  RefreshCw,
  Send,
  Wifi,
  WifiOff,
} from "lucide-react";
import { DashboardShell } from "../components/dashboard/DashboardShell";
import { WidgetCard } from "../components/dashboard/WidgetCard";
import { WidgetGrid } from "../components/dashboard/WidgetGrid";
import { Kpi } from "../components/dashboard/Kpi";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/dashboard/states";
import { useHost } from "../state/HostContext";
import { useDatasource } from "../lib/useDatasource";
import {
  createDatasourceClient,
  type DashboardInput,
} from "../lib/datasources";

type Tab = "overview" | "claims" | "sources";

const CATEGORY_OPTIONS = [
  "results",
  "management",
  "filings",
  "guidance",
  "valuation",
  "risk",
];

export function DashboardPage() {
  const { status, context, getToken, refresh, publish } = useHost();
  const ticker = context.ticker;
  const company = context.company;
  const userIndex = context.user?.userIndex ?? 0;
  const hasToken = Boolean(context.session?.token);
  const enabled = Boolean(ticker && hasToken);

  const client = useMemo(() => createDatasourceClient(getToken), [getToken]);

  // ---- Status-tracked filters / tab (pillar #4) ----
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [mode, setMode] = useState<"fast" | "expert">("expert");
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [question, setQuestion] = useState("");

  const catKey = categories.join(",");

  // ---- Document intelligence: proprietary docs for this ticker ----
  const docs = useDatasource(
    (signal) =>
      client.documentSearch(
        {
          query:
            question.trim() ||
            `Latest developments, financial updates, and thesis changes for ${ticker}`,
          user_index: userIndex,
          ticker_symbol: ticker!,
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
          categories: categories.length ? categories : undefined,
        },
        signal,
      ),
    [ticker, userIndex, fromDate, toDate, catKey],
    { enabled, debounceMs: 300 },
  );

  // ---- Latest news/web developments ----
  const news = useDatasource(
    (signal) =>
      client.newsSearch(
        {
          query: `${company ?? ticker} results, guidance, management commentary`,
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
        },
        signal,
      ),
    [ticker, company, fromDate, toDate],
    { enabled, debounceMs: 300 },
  );

  // ---- "Ask this dashboard" — streamed answer grounded in current state ----
  const [answer, setAnswer] = useState("");
  const [answering, setAnswering] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const askAbort = useRef<AbortController | null>(null);

  // Snapshot of the open filters/tab — forwarded so the answer is based on
  // exactly what the user was looking at when they asked.
  const dashboardInputs = useMemo<DashboardInput[]>(
    () => [
      { key: "active_tab", label: "Active tab", value: activeTab },
      { key: "from_date", label: "From", value: fromDate || null },
      { key: "to_date", label: "To", value: toDate || null },
      { key: "categories", label: "Categories", value: categories },
      { key: "answer_mode", label: "Mode", value: mode },
      { key: "ticker", label: "Ticker", value: ticker ?? null },
    ],
    [activeTab, fromDate, toDate, categories, mode, ticker],
  );

  async function ask() {
    if (!enabled || !question.trim()) return;
    askAbort.current?.abort();
    const controller = new AbortController();
    askAbort.current = controller;
    setAnswer("");
    setAnswerError(null);
    setAnswering(true);
    publish("dashboard.metric", {
      event: "ask",
      ticker,
      activeTab,
      filters: { fromDate, toDate, categories, mode },
    });
    try {
      const { stream } = await client.munsChat(
        {
          tasks: [question.trim()],
          tickerSymbols: ticker ? [ticker] : undefined,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          docIndex: [userIndex],
          dashboardInputs,
          mode,
        },
        controller.signal,
      );
      for await (const chunk of stream) {
        setAnswer((prev) => prev + chunk);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Request failed";
      setAnswerError(message);
      publish("dashboard.error", { event: "ask_failed", message });
    } finally {
      setAnswering(false);
    }
  }

  function toggleCategory(c: string) {
    setCategories((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  }

  // ---- Derived KPIs ----
  const claims = docs.kind === "success" ? toArray(docs.data.structured_data) : [];
  const citations =
    docs.kind === "success" ? toArray(docs.data.citations) : [];
  const newsItems = news.kind === "success" ? toArray(news.data.results) : [];
  const freshness = latestDate([...newsItems, ...citations]);

  const kpisLoading = docs.kind === "loading" || news.kind === "loading";

  return (
    <DashboardShell
      title="Memo Intelligence"
      ticker={ticker}
      company={company}
      headerActions={
        <>
          <ViewToggle value={activeTab} onChange={setActiveTab} />
          <ConnectionDot status={status} />
          <IconButton
            label="Refresh context"
            onClick={() => void refresh()}
            icon={<RefreshCw size={14} />}
          />
          <IconButton
            label="Export"
            onClick={() =>
              publish("dashboard.metric", { event: "export", ticker })
            }
            icon={<Download size={14} />}
          />
        </>
      }
      footer={
        <span>
          {enabled
            ? `Grounded in your Munshot documents${
                freshness ? ` · latest source ${freshness}` : ""
              }`
            : "Open this dashboard inside Munshot to load your data."}
        </span>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Row 1 — Context / filters */}
        <WidgetGrid wide>
          <WidgetCard
            title="Context & filters"
            subtitle="Scope the analysis — your selections are sent with every question."
            category="tools"
            wide
          >
            <FilterControls
              ticker={ticker}
              fromDate={fromDate}
              toDate={toDate}
              categories={categories}
              mode={mode}
              onFromDate={setFromDate}
              onToDate={setToDate}
              onToggleCategory={toggleCategory}
              onMode={setMode}
            />
          </WidgetCard>
        </WidgetGrid>

        {/* Row 2 — KPI summary */}
        <WidgetGrid>
          <WidgetCard
            title="Key metrics"
            subtitle="Snapshot of available evidence"
            category="analytics"
          >
            {!enabled ? (
              <EmptyState
                message="No ticker selected"
                hint="Select a company in Munshot to populate metrics."
              />
            ) : kpisLoading ? (
              <LoadingState rows={3} />
            ) : docs.kind === "error" ? (
              <ErrorState message="Couldn't load document metrics." />
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                }}
              >
                <Kpi
                  label="Claims extracted"
                  value={claims.length}
                  scope="from your documents"
                />
                <Kpi
                  label="Citations"
                  value={citations.length}
                  scope="source-backed"
                />
                <Kpi
                  label="News hits"
                  value={newsItems.length}
                  scope="recent window"
                />
                <Kpi
                  label="Freshness"
                  value={freshness ?? "—"}
                  scope="latest source"
                />
              </div>
            )}
          </WidgetCard>
        </WidgetGrid>

        {/* Row 3 — Primary analysis: Ask this dashboard */}
        <WidgetGrid wide>
          <WidgetCard
            title="Ask this dashboard"
            subtitle="Answers use your open filters, tab, ticker, and documents."
            category="analytics"
            wide
            style={ringFor(activeTab === "overview")}
          >
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void ask();
                  }}
                  placeholder={
                    enabled
                      ? "e.g. What changed in the thesis since the last memo?"
                      : "Open in Munshot to ask"
                  }
                  disabled={!enabled || answering}
                  style={inputStyle}
                />
                <button
                  onClick={() => void ask()}
                  disabled={!enabled || answering || !question.trim()}
                  style={primaryButtonStyle(!enabled || answering || !question.trim())}
                >
                  <Send size={14} />
                  {answering ? "Asking…" : "Ask"}
                </button>
              </div>

              {!enabled ? (
                <EmptyState
                  message="Connect to ask"
                  hint="This dashboard answers questions grounded in your Munshot documents and current filters."
                />
              ) : answerError ? (
                <ErrorState message="The answer couldn't be generated." />
              ) : answering && !answer ? (
                <LoadingState rows={4} />
              ) : answer ? (
                <div
                  style={{
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: "#374151",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {answer}
                </div>
              ) : (
                <EmptyState
                  message="Ask a question to begin"
                  hint="Try “Summarize the latest results vs. our thesis.”"
                />
              )}
            </div>
          </WidgetCard>
        </WidgetGrid>

        {/* Row 4 — Detail + sources */}
        <WidgetGrid wide>
          <WidgetCard
            title="Extracted claims"
            subtitle="Structured findings from your documents"
            category="india"
            wide
            style={ringFor(activeTab === "claims")}
          >
            <ListWidget
              state={docs.kind}
              enabled={enabled}
              items={claims}
              emptyMessage="No claims extracted yet"
              emptyHint="Adjust filters or ask a question to surface document claims."
            />
          </WidgetCard>

          <WidgetCard
            title="Source trail"
            subtitle="Citations and recent news, newest first"
            category="markets"
            style={ringFor(activeTab === "sources")}
          >
            <ListWidget
              state={news.kind === "loading" || docs.kind === "loading" ? "loading" : news.kind}
              enabled={enabled}
              items={[...citations, ...newsItems]}
              emptyMessage="No sources yet"
              emptyHint="Sources appear once documents and news load."
            />
          </WidgetCard>
        </WidgetGrid>
      </div>
    </DashboardShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Local widgets                                                              */
/* -------------------------------------------------------------------------- */

function FilterControls({
  ticker,
  fromDate,
  toDate,
  categories,
  mode,
  onFromDate,
  onToDate,
  onToggleCategory,
  onMode,
}: {
  ticker?: string;
  fromDate: string;
  toDate: string;
  categories: string[];
  mode: "fast" | "expert";
  onFromDate: (v: string) => void;
  onToDate: (v: string) => void;
  onToggleCategory: (c: string) => void;
  onMode: (m: "fast" | "expert") => void;
}) {
  return (
    <div
      style={{
        padding: 16,
        display: "flex",
        flexWrap: "wrap",
        gap: 16,
        alignItems: "flex-end",
      }}
    >
      <Field label="Ticker">
        <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
          {ticker ?? "—"}
        </div>
      </Field>
      <Field label="From">
        <input
          type="date"
          value={fromDate}
          onChange={(e) => onFromDate(e.target.value)}
          style={inputStyle}
        />
      </Field>
      <Field label="To">
        <input
          type="date"
          value={toDate}
          onChange={(e) => onToDate(e.target.value)}
          style={inputStyle}
        />
      </Field>
      <Field label="Answer mode">
        <div style={{ display: "flex", gap: 6 }}>
          {(["expert", "fast"] as const).map((m) => (
            <button
              key={m}
              onClick={() => onMode(m)}
              style={chipStyle(mode === m)}
            >
              {m}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Categories">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {CATEGORY_OPTIONS.map((c) => (
            <button
              key={c}
              onClick={() => onToggleCategory(c)}
              style={chipStyle(categories.includes(c))}
            >
              {c}
            </button>
          ))}
        </div>
      </Field>
    </div>
  );
}

function ListWidget({
  state,
  enabled,
  items,
  emptyMessage,
  emptyHint,
}: {
  state: "idle" | "loading" | "success" | "error";
  enabled: boolean;
  items: Record<string, unknown>[];
  emptyMessage: string;
  emptyHint: string;
}) {
  if (!enabled) {
    return (
      <EmptyState
        message="Not connected"
        hint="Open this dashboard inside Munshot to load data."
      />
    );
  }
  if (state === "loading") return <LoadingState rows={5} />;
  if (state === "error") return <ErrorState />;
  if (items.length === 0) {
    return <EmptyState message={emptyMessage} hint={emptyHint} />;
  }
  return (
    <div style={{ padding: "8px 0", maxHeight: 320, overflow: "auto" }}>
      {items.slice(0, 50).map((item, i) => {
        const title = pick(item, ["title", "claim", "label", "headline", "name"]);
        const body = pick(item, ["summary", "snippet", "text", "value", "description"]);
        const date = pick(item, ["date", "published_at", "publishedAt", "source_date"]);
        const url = pick(item, ["url", "link", "source_url"]);
        return (
          <div
            key={i}
            style={{
              padding: "10px 16px",
              borderBottom: "1px solid rgba(229,231,235,0.7)",
            }}
          >
            <div
              style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}
            >
              {title ?? `Item ${i + 1}`}
            </div>
            {body && (
              <div
                style={{
                  fontSize: 12,
                  color: "#6b7280",
                  marginTop: 2,
                  lineHeight: 1.4,
                }}
              >
                {truncate(body, 220)}
              </div>
            )}
            {(date || url) && (
              <div
                style={{
                  fontSize: 11,
                  color: "#9ca3af",
                  marginTop: 4,
                  display: "flex",
                  gap: 8,
                }}
              >
                {date && <span>{date}</span>}
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#4338ca" }}
                  >
                    source
                  </a>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: Tab;
  onChange: (t: Tab) => void;
}) {
  const tabs: Tab[] = ["overview", "claims", "sources"];
  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        padding: 2,
        background: "#f3f4f6",
        borderRadius: 8,
      }}
    >
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          style={{
            fontSize: 12,
            fontWeight: 600,
            textTransform: "capitalize",
            padding: "4px 10px",
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
            background: value === t ? "#ffffff" : "transparent",
            color: value === t ? "#4338ca" : "#6b7280",
            boxShadow: value === t ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function ConnectionDot({ status }: { status: string }) {
  const ready = status === "ready";
  const standalone = status === "standalone";
  const color = ready ? "#16a34a" : standalone ? "#9ca3af" : status === "error" ? "#ef4444" : "#d97706";
  const label =
    ready ? "Connected" : standalone ? "Standalone" : status === "error" ? "Host error" : "Connecting";
  return (
    <span
      title={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        color: "#6b7280",
        padding: "2px 8px",
      }}
    >
      {ready ? <Wifi size={13} color={color} /> : <WifiOff size={13} color={color} />}
      <span style={{ color }}>{label}</span>
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#9ca3af",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function IconButton({
  label,
  onClick,
  icon,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        borderRadius: 6,
        border: "1px solid #e5e7eb",
        background: "#ffffff",
        color: "#6b7280",
        cursor: "pointer",
      }}
    >
      {icon}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles + helpers                                                           */
/* -------------------------------------------------------------------------- */

const inputStyle: React.CSSProperties = {
  flex: 1,
  height: 32,
  padding: "0 10px",
  fontSize: 13,
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: "#ffffff",
  color: "#111827",
  outline: "none",
};

function primaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 32,
    padding: "0 14px",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 8,
    border: "none",
    background: disabled ? "#c7d2fe" : "#4f46e5",
    color: "#ffffff",
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 600,
    textTransform: "capitalize",
    padding: "4px 10px",
    borderRadius: 999,
    cursor: "pointer",
    border: `1px solid ${active ? "#e0e7ff" : "#e5e7eb"}`,
    background: active ? "#eef2ff" : "#ffffff",
    color: active ? "#4338ca" : "#6b7280",
  };
}

function ringFor(active: boolean): React.CSSProperties {
  return active
    ? { boxShadow: "0 0 0 2px rgba(79,70,229,0.35), 0 1px 4px rgba(0,0,0,0.04)" }
    : {};
}

function toArray(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object");
}

function pick(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim().length > 0) return v;
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function latestDate(items: Record<string, unknown>[]): string | undefined {
  const dates = items
    .map((it) => pick(it, ["date", "published_at", "publishedAt", "source_date"]))
    .filter((d): d is string => Boolean(d))
    .map((d) => ({ raw: d, t: Date.parse(d) }))
    .filter((d) => !Number.isNaN(d.t))
    .sort((a, b) => b.t - a.t);
  return dates[0]?.raw;
}
