import { useMemo } from "react";
import { Building2, Check } from "lucide-react";
import { useMemoProject } from "../state/MemoProjectContext";
import { useHost } from "../state/HostContext";

// Top-of-workspace filter to select the company the memo is about. The
// choice is the authoritative company for the whole pipeline (research,
// memo understanding, generation) — it overrides the company auto-detected
// from the uploaded memo and survives a new upload.
export function CompanyFilter() {
  const { state, effectiveDetection, setSelectedCompany } = useMemoProject();
  const { context: host } = useHost();

  // Displayed value: the user's explicit choice, otherwise whatever was
  // detected from the memo once one is uploaded.
  const value =
    state.selectedCompany ?? effectiveDetection?.detectedCompany ?? "";

  // Suggestions: the host-selected company (when embedded), the bundled
  // demo company, and whatever the memo detector found.
  const suggestions = useMemo(() => {
    const set = new Set<string>();
    [
      host.company,
      "RateGain Travel Technologies",
      state.detection?.detectedCompany,
    ].forEach((c) => {
      if (c && c.trim()) set.add(c.trim());
    });
    return Array.from(set);
  }, [host.company, state.detection?.detectedCompany]);

  const isSet = Boolean(value.trim());

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
              Select the company this memo covers
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <input
            list="company-filter-suggestions"
            value={value}
            onChange={(e) =>
              setSelectedCompany(e.target.value.trim() ? e.target.value : null)
            }
            placeholder="Select or type a company name…"
            aria-label="Company name"
            className="w-full h-9 px-3 text-[13px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:border-[var(--color-ink)] focus:ring-2 focus:ring-[var(--color-ink-soft)]"
          />
          <datalist id="company-filter-suggestions">
            {suggestions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        {isSet && (
          <span className="inline-flex items-center gap-1.5 shrink-0 h-7 px-2.5 rounded-full text-[11px] font-semibold bg-[var(--color-success-soft)] text-[var(--color-success)]">
            <Check className="w-3.5 h-3.5" />
            Selected
          </span>
        )}
      </div>
    </section>
  );
}
