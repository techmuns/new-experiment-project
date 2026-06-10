import type { ReactNode } from "react";
import { CommandBar } from "./CommandBar";

interface AppShellProps {
  children: ReactNode;
}

// Phase 5H: single-page workbench shell. The left sidebar was removed —
// the only nav (Settings) lives in the CommandBar now. Content is centered
// and capped so it fills the freed space on laptops without stretching
// awkwardly on large monitors.
export function AppShell({ children }: AppShellProps) {
  return (
    <div className="h-full flex flex-col bg-[var(--color-bg)]">
      <CommandBar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1320px] mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
