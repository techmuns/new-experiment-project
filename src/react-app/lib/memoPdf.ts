import type jsPDF from "jspdf";
import type { FollowUpMemo, MemoSection } from "@shared/types";
import { humanSourceLabel } from "@shared/sanitizeMemo";

// Phase 6F.2: jsPDF + its html2canvas/dompurify transitive deps are
// ~400 KB unzipped. Only load them when the user actually requests a
// PDF — keeps the initial bundle the same size as before this feature.
let JsPdfCtor: typeof jsPDF | null = null;
async function getJsPdfCtor(): Promise<typeof jsPDF> {
  if (JsPdfCtor) return JsPdfCtor;
  const mod = await import("jspdf");
  JsPdfCtor = mod.default;
  return JsPdfCtor;
}

// Phase 6F.2: real downloadable PDF.
//
// Why: the previous Print / Save as PDF path opened a styled HTML
// window and called window.print(). When the user selected
// "Microsoft Print to PDF" the OS driver outlined every glyph into
// vector paths — the resulting PDF carried 80 streams of bezier curves
// and ZERO fonts, so it was unsearchable, accessibility-hostile, and
// ~2 MB for what should be a ≤120 KB text PDF.
//
// This builder uses jsPDF directly. The output carries real text
// (selectable, searchable, copy-pasteable), embedded Times Roman, and
// proper page breaks. It targets the same ≤3-page budget as the print
// document, and content scope is the SAME as the print HTML: core
// sec_* sections only, with manual checks at the foot. Supplementary
// sup_* panels are out of scope to protect the page budget.

export interface BuildMemoPdfOptions {
  researchWindowLabel?: string;
}

// All measurements in mm. A4 = 210×297.
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_X = 14;
const MARGIN_TOP = 16;
const MARGIN_BOTTOM = 16;
const CONTENT_W = PAGE_W - 2 * MARGIN_X;

interface DocCtx {
  doc: jsPDF;
  y: number;
}

async function newCtx(dense: boolean): Promise<DocCtx> {
  const Ctor = await getJsPdfCtor();
  const doc = new Ctor({ unit: "mm", format: "a4", compress: true });
  doc.setFont("times", "normal");
  doc.setFontSize(dense ? 9 : 10);
  return { doc, y: MARGIN_TOP };
}

function ensureRoom(ctx: DocCtx, needed: number): void {
  if (ctx.y + needed > PAGE_H - MARGIN_BOTTOM) {
    ctx.doc.addPage();
    ctx.y = MARGIN_TOP;
  }
}

function writeWrapped(
  ctx: DocCtx,
  text: string,
  opts: { size: number; bold?: boolean; lineGap?: number; color?: [number, number, number] },
): void {
  const { doc } = ctx;
  doc.setFontSize(opts.size);
  doc.setFont("times", opts.bold ? "bold" : "normal");
  doc.setTextColor(...(opts.color ?? [16, 20, 24]));
  const lineGap = opts.lineGap ?? opts.size * 0.42;
  const lines = doc.splitTextToSize(text, CONTENT_W);
  for (const line of lines) {
    ensureRoom(ctx, lineGap);
    doc.text(line, MARGIN_X, ctx.y);
    ctx.y += lineGap;
  }
}

function drawHr(ctx: DocCtx, weight = 0.4): void {
  ensureRoom(ctx, 1.5);
  ctx.doc.setLineWidth(weight);
  ctx.doc.setDrawColor(180, 184, 190);
  ctx.doc.line(MARGIN_X, ctx.y, PAGE_W - MARGIN_X, ctx.y);
  ctx.y += 2;
}

function drawBridge(ctx: DocCtx, rows: NonNullable<MemoSection["bridge"]>, dense: boolean): void {
  if (rows.length === 0) return;
  const { doc } = ctx;
  const cellSize = dense ? 7.5 : 8;
  const lineGap = cellSize * 0.42;
  // Column layout: Metric | Original | Latest | Read-through
  // Widths proportional, summing to CONTENT_W.
  const widths = [
    CONTENT_W * 0.22,
    CONTENT_W * 0.22,
    CONTENT_W * 0.22,
    CONTENT_W * 0.34,
  ];
  const xs = [
    MARGIN_X,
    MARGIN_X + widths[0],
    MARGIN_X + widths[0] + widths[1],
    MARGIN_X + widths[0] + widths[1] + widths[2],
  ];

  // Pre-measure each row's height (max wrapped lines × lineGap).
  doc.setFontSize(cellSize);
  doc.setFont("times", "normal");
  const cells: string[][] = [
    ["Metric", "Original anchor", "Latest", "Read-through"],
    ...rows.map((r) => [
      r.metric,
      r.original ?? "—",
      r.latest ?? "—",
      r.readThrough ?? "—",
    ]),
  ];
  const wrapped: string[][][] = cells.map((row, ri) =>
    row.map((cell, ci) => {
      doc.setFont("times", ri === 0 ? "bold" : "normal");
      doc.setFontSize(cellSize);
      return doc.splitTextToSize(cell, widths[ci] - 2) as string[];
    }),
  );
  const heights = wrapped.map(
    (row) => Math.max(...row.map((cell) => cell.length)) * lineGap + 1.5,
  );
  const totalHeight = heights.reduce((a, b) => a + b, 0);
  // Allow the bridge to break across pages if it doesn't fit on the current one
  ensureRoom(ctx, Math.min(totalHeight, 40));

  // Render the table row by row, breaking pages when needed.
  for (let ri = 0; ri < wrapped.length; ri++) {
    const row = wrapped[ri];
    const h = heights[ri];
    ensureRoom(ctx, h);
    if (ri === 0) {
      doc.setFillColor(238, 236, 228);
      doc.rect(MARGIN_X, ctx.y - lineGap + 1, CONTENT_W, h - 0.5, "F");
    }
    doc.setLineWidth(0.2);
    doc.setDrawColor(190, 195, 200);
    // Bottom border for each row
    doc.line(MARGIN_X, ctx.y + h - lineGap - 0.5, PAGE_W - MARGIN_X, ctx.y + h - lineGap - 0.5);
    for (let ci = 0; ci < row.length; ci++) {
      doc.setFont("times", ri === 0 ? "bold" : "normal");
      doc.setFontSize(cellSize);
      doc.setTextColor(ri === 0 ? 90 : 16, ri === 0 ? 96 : 20, ri === 0 ? 102 : 24);
      const lines = row[ci];
      for (let li = 0; li < lines.length; li++) {
        doc.text(lines[li], xs[ci] + 1, ctx.y + li * lineGap);
      }
    }
    ctx.y += h;
  }
  ctx.y += 1.5;
}

function visibleCharCount(memo: FollowUpMemo): number {
  let n = memo.title.length;
  for (const s of memo.sections) {
    n += (s.summary ?? "").length;
    n += (s.body ?? "").length;
    for (const b of s.bullets ?? []) n += b.length;
    for (const row of s.bridge ?? []) {
      n +=
        row.metric.length +
        (row.original ?? "").length +
        (row.latest ?? "").length +
        (row.readThrough ?? "").length;
    }
  }
  for (const m of memo.manualChecksRemaining ?? []) n += m.length;
  return n;
}

function signalLabel(signal: NonNullable<MemoSection["signal"]>): string {
  switch (signal) {
    case "positive": return "Positive";
    case "negative": return "Negative";
    case "watch": return "Watch";
    case "neutral": return "Neutral";
  }
}

export async function buildMemoPdf(
  memo: FollowUpMemo,
  opts: BuildMemoPdfOptions = {},
): Promise<Blob> {
  // Adaptive density — keeps a long memo inside the 3-page budget.
  const dense = visibleCharCount(memo) > 9_000;
  const ctx = await newCtx(dense);
  const { doc } = ctx;

  // Header
  writeWrapped(ctx, memo.title, {
    size: dense ? 13 : 14,
    bold: true,
  });
  const date = new Date(memo.generatedAt).toLocaleDateString("en-US", { dateStyle: "medium" });
  const metaParts = [
    `Generated ${date}`,
    opts.researchWindowLabel ?? null,
    "Confidential — internal research draft",
  ].filter(Boolean) as string[];
  writeWrapped(ctx, metaParts.join("  ·  "), {
    size: 7.5,
    color: [110, 116, 124],
    lineGap: 3.2,
  });
  ctx.y += 1;
  drawHr(ctx, 0.6);

  // Core sections
  memo.sections.forEach((s, i) => {
    renderSection(ctx, s, i + 1, dense);
  });

  // Manual checks
  if (memo.manualChecksRemaining && memo.manualChecksRemaining.length > 0) {
    ctx.y += 1.5;
    drawHr(ctx, 0.4);
    writeWrapped(ctx, "Manual checks remaining", { size: 10.5, bold: true });
    ctx.y += 0.5;
    for (const m of memo.manualChecksRemaining) {
      writeWrapped(ctx, `• ${m}`, { size: 8.5, color: [70, 78, 90] });
    }
  }

  // Footer caveat on the last page
  ensureRoom(ctx, 8);
  ctx.y = PAGE_H - MARGIN_BOTTOM - 6;
  drawHr(ctx, 0.3);
  writeWrapped(
    ctx,
    "Draft for research support — not investment advice; analyst sign-off required.  Supplementary valuation / EPS / memo-vs-actual detail is available in the dashboard.",
    { size: 7, color: [130, 135, 142] },
  );

  return doc.output("blob");
}

function renderSection(ctx: DocCtx, s: MemoSection, index: number, dense: boolean): void {
  ctx.y += dense ? 1.5 : 2;
  // Heading line: "NN  Title  [signal]"
  ensureRoom(ctx, 8);
  const heading = `${String(index).padStart(2, "0")}  ${s.title}`;
  writeWrapped(ctx, heading, { size: dense ? 11 : 11.5, bold: true });
  if (s.signal) {
    ctx.doc.setFontSize(7);
    ctx.doc.setFont("times", "italic");
    ctx.doc.setTextColor(120, 124, 132);
    ctx.doc.text(`(${signalLabel(s.signal)})`, MARGIN_X + 4, ctx.y - (dense ? 4.2 : 4.5));
  }
  ctx.y += 0.4;

  if (s.summary && s.summary !== s.body) {
    writeWrapped(ctx, s.summary, {
      size: dense ? 9 : 9.5,
      bold: true,
      lineGap: dense ? 3.8 : 4.0,
    });
  }
  if (s.bridge && s.bridge.length > 0) {
    ctx.y += 1;
    drawBridge(ctx, s.bridge, dense);
  }
  if (s.body) {
    writeWrapped(ctx, s.body, {
      size: dense ? 8.5 : 9,
      lineGap: dense ? 3.6 : 3.9,
    });
  }
  if (s.bullets && s.bullets.length > 0) {
    ctx.y += 0.5;
    for (const b of s.bullets) {
      writeWrapped(ctx, `• ${b}`, {
        size: dense ? 8.5 : 9,
        lineGap: dense ? 3.6 : 3.9,
      });
    }
  }
  if (s.sources.length > 0) {
    ctx.y += 0.4;
    const labels = s.sources
      .map((src, i) => {
        const page = src.page ? ` p.${src.page}` : "";
        return `${humanSourceLabel(src.documentId, i)}${page}`;
      })
      .join("  ·  ");
    writeWrapped(ctx, `Sources: ${labels}`, {
      size: 7.2,
      color: [130, 135, 142],
      lineGap: 2.9,
    });
  }
  ctx.y += dense ? 1.2 : 1.6;
}

export async function downloadMemoPdf(
  memo: FollowUpMemo,
  filenameStem: string,
  opts: BuildMemoPdfOptions = {},
): Promise<void> {
  const blob = await buildMemoPdf(memo, opts);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameStem}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
