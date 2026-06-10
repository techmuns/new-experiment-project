import { useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { Upload, FileText, CheckCircle2 } from "lucide-react";
import { cn } from "../../lib/cn";
import { formatBytes } from "../../lib/fileMeta";
import type { LocalUploadedFile } from "@shared/types";

interface UploadSlotProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  acceptedTypes?: string;
  demoFilename?: string;
  variant?: "primary" | "compact";
  /** When set, this slot shows real uploaded-file metadata instead of demo */
  currentFile?: LocalUploadedFile | null;
  onFileSelected?: (file: File) => void;
}

export function UploadSlot({
  title,
  description,
  icon: Icon,
  acceptedTypes = ".pdf,.txt,.md,.docx,.xlsx",
  demoFilename,
  variant = "compact",
  currentFile,
  onFileSelected,
}: UploadSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const realFilename = currentFile?.filename;
  const displayName = realFilename ?? demoFilename;
  const isReal = Boolean(currentFile);

  const handlePick = (file?: File) => {
    if (!file) return;
    onFileSelected?.(file);
  };

  if (variant === "primary") {
    return (
      <div
        className={cn(
          // Phase 5I: subtle gradient when empty; settled solid + shadow
          // bump when a file is loaded. Hover ring only when empty.
          "relative rounded-[var(--radius-xl)] border-2 border-dashed p-7 flex flex-col gap-5 transition-shadow transition-colors",
          isReal
            ? "border-[var(--color-ink)] bg-[var(--color-ink-soft)]/40 shadow-[var(--shadow-md)]"
            : "border-[var(--color-border-strong)] bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-ink-soft)]/60 shadow-[var(--shadow-sm)] hover:border-[var(--color-ink)] hover:ring-2 hover:ring-[var(--color-ink)]/15",
        )}
      >
        {isReal && (
          <div className="absolute -top-2.5 left-5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-[color-mix(in_srgb,var(--color-success)_28%,white)] bg-[var(--color-success-soft)] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-success)]">
            <CheckCircle2 className="w-3 h-3" strokeWidth={2.5} />
            Memo loaded
            {currentFile && (
              <span className="font-medium text-[var(--color-success)]/80 normal-case tracking-normal">
                · {formatBytes(currentFile.sizeBytes)}
              </span>
            )}
          </div>
        )}

        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[var(--color-ink)] text-white grid place-items-center shrink-0 shadow-[var(--shadow-sm)]">
            {Icon ? <Icon className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink)]">
              Primary input
            </div>
            <h3 className="text-[17px] font-semibold text-[var(--color-text)] mt-0.5 tracking-tight">
              {title}
            </h3>
            {description && (
              <p className="text-[12.5px] text-[var(--color-text-muted)] mt-1 leading-relaxed">
                {description}
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center justify-center gap-2 h-12 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-muted)] text-[13px] font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-ink)] transition-colors"
        >
          <Upload className="w-4 h-4" />
          {isReal ? "Replace file" : "Drop memo to begin"}
        </button>

        {!isReal && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-subtle)] mr-1">
              Supports
            </span>
            {[".txt", ".md", ".pdf"].map((ext) => (
              <span
                key={ext}
                className="inline-flex items-center h-5 px-1.5 rounded text-[10.5px] font-mono text-[var(--color-text-muted)] bg-[var(--color-surface)] border border-[var(--color-border)]"
              >
                {ext}
              </span>
            ))}
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={acceptedTypes}
          className="hidden"
          onChange={(e) => handlePick(e.target.files?.[0])}
        />

        {displayName && (
          <div
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] border transition-opacity",
              isReal
                ? "bg-[var(--color-surface)] border-[var(--color-ink)]"
                : "bg-[var(--color-surface-muted)] border-[var(--color-border)]",
            )}
          >
            <div
              className={cn(
                "w-8 h-8 rounded-[var(--radius-sm)] grid place-items-center shrink-0",
                isReal
                  ? "bg-[var(--color-ink)] text-white"
                  : "bg-[var(--color-surface-muted)] text-[var(--color-text-subtle)]",
              )}
            >
              {isReal ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-semibold text-[var(--color-text)] truncate">
                {displayName}
              </div>
              <div className="text-[11px] text-[var(--color-text-muted)] tnum">
                {isReal && currentFile
                  ? `.${currentFile.extension || "?"} · ${formatBytes(currentFile.sizeBytes)} · ${
                      currentFile.extractionSupported
                        ? "extraction supported"
                        : "extraction not yet supported"
                    }`
                  : "Demo filename · no file picked yet"}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-strong)] transition-colors">
      <div
        className={cn(
          "w-8 h-8 rounded-[var(--radius-sm)] grid place-items-center shrink-0",
          isReal
            ? "bg-[var(--color-ink)] text-white"
            : "bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]",
        )}
      >
        {Icon ? <Icon className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-semibold text-[var(--color-text)] truncate">
          {title}
        </div>
        {displayName ? (
          <div className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)] truncate tnum">
            <FileText className="w-3 h-3 shrink-0" />
            <span className="truncate">{displayName}</span>
            {isReal && currentFile && (
              <span className="text-[var(--color-text-subtle)] shrink-0">
                · {formatBytes(currentFile.sizeBytes)}
              </span>
            )}
          </div>
        ) : (
          <div className="text-[11px] text-[var(--color-text-subtle)] truncate">
            {description ?? "Drop file"}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-subtle)] hover:text-[var(--color-ink)] transition-colors px-1.5"
      >
        {isReal ? "Replace" : "Select"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={acceptedTypes}
        className="hidden"
        onChange={(e) => handlePick(e.target.files?.[0])}
      />
    </div>
  );
}
