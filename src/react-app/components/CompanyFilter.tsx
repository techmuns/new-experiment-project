import { useEffect, useRef, useState } from "react";
import { Building2, Check, Loader2, Search } from "lucide-react";
import type { StockSearchHit } from "@shared/types";
import { api } from "../lib/api";
import { useMemoProject } from "../state/MemoProjectContext";

// Top-of-workspace search to select the company the memo is about. Queries
// the Muns stock-search API (proxied through the Worker, which injects the
// bearer token + static user_index) and lets the user pick a result. The
// choice is authoritative for the whole pipeline (research, understanding,
// generation), overrides the company auto-detected from the memo, and
// survives a new upload.
export function CompanyFilter() {
  const { state, effectiveDetection, setSelectedCompany } = useMemoProject();

  const effectiveCompany =
    state.selectedCompany ?? effectiveDetection?.detectedCompany ?? "";

  const [query, setQuery] = useState(effectiveCompany);
  const [results, setResults] = useState<StockSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const focusedRef = useRef(false);

  // Reflect the active company in the box when it changes elsewhere
  // (Step 2 edit, memo detection, Start over) and the user isn't typing.
  // Deferred so it doesn't synchronously cascade a render.
  useEffect(() => {
    if (focusedRef.current) return;
    queueMicrotask(() => {
      if (!focusedRef.current) setQuery(effectiveCompany);
    });
  }, [effectiveCompany]);

  // Debounced search. Only runs while the dropdown is open so selecting a
  // result (which closes it) doesn't immediately re-search.
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      queueMicrotask(() => {
        setResults([]);
        setLoading(false);
        setError(null);
      });
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      api
        .stockSearch(q, controller.signal)
        .then((res) => {
          if (cancelled) return;
          if (res.ok) {
            setResults(res.hits);
            setError(null);
          } else {
            setResults([]);
            setError(res.message || "Search is unavailable.");
          }
        })
        .catch((err: unknown) => {
          if (cancelled || controller.signal.aborted) return;
          setResults([]);
          setError(err instanceof Error ? err.message : "Search failed.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  function select(hit: StockSearchHit) {
    setSelectedCompany(hit.companyName);
    setQuery(hit.companyName);
    setResults([]);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (results.length > 0) {
        select(results[0]);
      } else if (query.trim()) {
        setSelectedCompany(query.trim());
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const q = query.trim();
  const showDropdown = open && (loading || error !== null || q.length >= 2);

  return (
    <section className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)] px-5 py-3.5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-[var(--radius-md)] bg-[var(--color-ink-soft)] text-[var(--color-ink)] grid place-items-center">
            <Building2 className="w-4 h-4" />
          </div>
          <div className="leading-tight">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink)]">
              Company
            </div>
            <div className="text-[11px] text-[var(--color-text-subtle)]">
              Search the company this memo covers
            </div>
          </div>
        </div>

        <div className="relative flex-1 min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-subtle)]" />
          <input
            value={query}
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              setOpen(true);
              if (!v.trim()) setSelectedCompany(null);
            }}
            onFocus={() => {
              focusedRef.current = true;
              setOpen(true);
            }}
            onBlur={() => {
              focusedRef.current = false;
              // Delay so a result click registers before the dropdown closes.
              setTimeout(() => setOpen(false), 150);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search by company name or ticker… (e.g. RELI)"
            aria-label="Company search"
            autoComplete="off"
            className="w-full h-9 pl-9 pr-3 text-[13px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:border-[var(--color-ink)] focus:ring-2 focus:ring-[var(--color-ink-soft)]"
          />

          {showDropdown && (
            <div
              // Keep focus on the input so blur doesn't close before click.
              onMouseDown={(e) => e.preventDefault()}
              className="absolute left-0 right-0 top-full mt-1 z-20 max-h-72 overflow-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-md)]"
            >
              {loading && (
                <div className="flex items-center gap-2 px-3 py-2.5 text-[12px] text-[var(--color-text-muted)]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Searching…
                </div>
              )}
              {!loading && error && (
                <div className="px-3 py-2.5 text-[12px] text-[var(--color-warning)]">
                  {error}
                </div>
              )}
              {!loading && !error && results.length === 0 && q.length >= 2 && (
                <div className="px-3 py-2.5 text-[12px] text-[var(--color-text-muted)]">
                  No matches for “{q}”.
                </div>
              )}
              {!loading &&
                !error &&
                results.map((hit) => (
                  <button
                    key={hit.ticker}
                    type="button"
                    onClick={() => select(hit)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-[var(--color-surface-muted)] border-b border-[var(--color-border)] last:border-b-0"
                  >
                    <span className="shrink-0 font-mono text-[11px] font-semibold text-[var(--color-ink)] bg-[var(--color-ink-soft)] rounded px-1.5 py-0.5 min-w-[64px] text-center">
                      {hit.ticker}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] text-[var(--color-text)] truncate">
                        {hit.companyName}
                      </span>
                      {(hit.country || hit.sector) && (
                        <span className="block text-[11px] text-[var(--color-text-subtle)] truncate">
                          {[hit.country, hit.sector].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
            </div>
          )}
        </div>

        {state.selectedCompany && (
          <span className="inline-flex items-center gap-1.5 shrink-0 h-7 px-2.5 rounded-full text-[11px] font-semibold bg-[var(--color-success-soft)] text-[var(--color-success)]">
            <Check className="w-3.5 h-3.5" />
            Selected
          </span>
        )}
      </div>
    </section>
  );
}
