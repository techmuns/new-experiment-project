import { useNavigate } from "react-router-dom";
import { ArrowUpRight, FileText } from "lucide-react";
import { Panel } from "./Panel";
import { Badge } from "./Badge";

interface MemoPreviewSection {
  index: number;
  title: string;
  teaser: string;
}

const SECTIONS: MemoPreviewSection[] = [
  {
    index: 1,
    title: "Memo vs Reality Scorecard",
    teaser:
      "Stock +16% in 25 months vs the memo's +43% base case; ~100% of return from earnings, multiple de-rated ~13%.",
  },
  {
    index: 2,
    title: "What Changed — Industry · Company · Financials",
    teaser:
      "AI overhang; Sojern transforms the security to debt-funded integration story; revenue beat, margin missed.",
  },
  {
    index: 3,
    title: "Shareholding & Ownership Changes",
    teaser:
      "Promoter stable ~48.8%; FII -5 ppt over 2 years; DII and retail picked up the slack — domestic tilt.",
  },
  {
    index: 4,
    title: "Industry & Regulatory Developments",
    teaser:
      "Generative-AI travel search is the defining structural risk; data-privacy regime is a net positive for owned intent data.",
  },
  {
    index: 5,
    title: "Corporate Events (Last 12 Months)",
    teaser:
      "Sojern close (Nov-2025), FY26 results (revenue beat, PAT down), CFO resignation (May-2026, second in two years).",
  },
  {
    index: 6,
    title: "Updated Investment View",
    teaser:
      "MIXED BUT MONITORABLE — Hold; add on margin recovery + permanent CFO + quantified synergies.",
  },
];

export function MemoPreview() {
  const navigate = useNavigate();

  return (
    <Panel
      eyebrow="Follow-up output"
      title="RateGain Follow-up Memo — Demo Output"
      actions={
        <button
          onClick={() => navigate("/output")}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-ink)] hover:text-[var(--color-ink-hover)]"
        >
          Open memo
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      }
    >
      <div className="flex items-center gap-2 mb-4">
        <Badge tone="ink" dot>
          Demo generated
        </Badge>
        <span className="text-[11px] text-[var(--color-text-muted)]">
          6 client-priority sections · target &lt;3 pages · supplementary valuation panels
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
        {SECTIONS.map((s) => (
          <div
            key={s.index}
            className="flex gap-3 py-2 border-b border-[var(--color-border)] last:border-b-0 md:[&:nth-last-child(2)]:border-b-0"
          >
            <div className="shrink-0 w-7 h-7 rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)] border border-[var(--color-border)] grid place-items-center">
              <FileText className="w-3.5 h-3.5 text-[var(--color-text-subtle)]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] font-mono text-[var(--color-text-subtle)] tnum">
                  0{s.index}
                </span>
                <h4 className="text-[13px] font-semibold text-[var(--color-text)] tracking-tight">
                  {s.title}
                </h4>
              </div>
              <p
                className="text-[12px] text-[var(--color-text-muted)] mt-0.5 leading-snug"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {s.teaser}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
