import { useEffect, useRef, useState } from "react";
import { ListChecks, Lock, Unlock } from "lucide-react";
import { Badge } from "./ui/Badge";

// Phase 6C: free-text textarea where the portfolio manager adds specific
// items they want validated in the follow-up memo — on top of whatever
// Memo Understanding extracted automatically. The text is threaded into
// every research-pass prompt and every memo-section prompt. Locked once
// research starts so a mid-run edit cannot quietly desync results from
// the prompt the user reviewed.

interface UserPrioritiesPanelProps {
  value: string;
  onChange: (value: string) => void;
  // When research has run, we lock the textbox so the priorities
  // stay aligned with what was actually researched. The user can
  // explicitly unlock to edit before re-running research.
  researchHasRun: boolean;
  disabled?: boolean;
}

const MAX_CHARS = 1500;

const PLACEHOLDER =
  "e.g.\n- Are major MFs (HDFC AMC, Nippon, Mirae) trimming or adding?\n- What did the Sojern earnout look like in the FY26 annual report?\n- Did the auditor flag any related-party transactions?";

export function UserPrioritiesPanel({
  value,
  onChange,
  researchHasRun,
  disabled,
}: UserPrioritiesPanelProps) {
  const [unlocked, setUnlocked] = useState(false);
  const locked = researchHasRun && !unlocked;
  const charCount = value.length;
  const charRemaining = MAX_CHARS - charCount;
  const overCap = charCount > MAX_CHARS;
  const lineCount = useLineCount(value);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-resize textarea to its content.
  useEffect(() => {
    if (!taRef.current) return;
    taRef.current.style.height = "0px";
    const next = Math.min(taRef.current.scrollHeight + 2, 360);
    taRef.current.style.height = `${Math.max(96, next)}px`;
  }, [value]);

  return (
    <section
      className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)] px-5 py-4"
      aria-label="What else should we research"
    >
      <header className="flex items-baseline justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink)]">
            <ListChecks className="w-3 h-3" />
            Your priorities
          </div>
          <h3 className="mt-0.5 text-[13.5px] font-semibold text-[var(--color-text)] tracking-tight">
            What else should we test in the follow-up memo?
          </h3>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {value.trim() && (
            <Badge tone="ink">
              {lineCount} item{lineCount === 1 ? "" : "s"}
            </Badge>
          )}
          {researchHasRun && (
            <button
              type="button"
              onClick={() => setUnlocked((v) => !v)}
              className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-ink)] transition-colors"
            >
              {locked ? (
                <>
                  <Lock className="w-3 h-3" />
                  Locked · click to edit
                </>
              ) : (
                <>
                  <Unlock className="w-3 h-3" />
                  Editing
                </>
              )}
            </button>
          )}
        </div>
      </header>

      <p className="text-[11.5px] text-[var(--color-text-muted)] leading-snug mb-2">
        Anything specific the portfolio manager wants in this update — fund-level
        ownership moves, regulatory items, auditor remarks, peer reads.
        One per line works well. We thread these into research AND the memo body.
      </p>

      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={locked}
        disabled={disabled}
        placeholder={PLACEHOLDER}
        spellCheck
        className={`w-full min-h-[96px] max-h-[360px] resize-y px-3 py-2 rounded-[var(--radius-md)] border ${
          overCap
            ? "border-[var(--color-warning)]"
            : "border-[var(--color-border)]"
        } bg-[var(--color-surface)] text-[13px] text-[var(--color-text)] leading-[1.55] focus:outline-none focus:ring-2 focus:ring-[var(--color-ink-soft)] ${
          locked
            ? "bg-[var(--color-surface-muted)] text-[var(--color-text-muted)] cursor-not-allowed"
            : ""
        } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
        style={{ fontFamily: "var(--font-serif)" }}
      />

      <div className="mt-1.5 flex items-center justify-between gap-3">
        <span
          className={`text-[10.5px] ${
            overCap ? "text-[var(--color-warning)]" : "text-[var(--color-text-subtle)]"
          }`}
        >
          {overCap
            ? `${Math.abs(charRemaining)} chars over · we'll trim the trailing text before sending to research.`
            : `${charRemaining} chars remaining`}
        </span>
        {value.trim() && !locked && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-[10.5px] text-[var(--color-text-muted)] hover:text-[var(--color-warning)] transition-colors"
          >
            Clear
          </button>
        )}
      </div>
    </section>
  );
}

function useLineCount(value: string): number {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length;
}
