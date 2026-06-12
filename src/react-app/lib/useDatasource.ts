import { useEffect, useState } from "react";

export type AsyncState<T> =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: T }
  | { kind: "error"; message: string };

interface Options {
  /** When false the resource stays idle (e.g. no ticker / no token yet). */
  enabled?: boolean;
  /** Debounce window before firing, in ms (filter changes ≥ 300ms). */
  debounceMs?: number;
}

/**
 * Runs an async datasource call, tracking idle/loading/success/error and
 * aborting in-flight requests when deps change or the component unmounts.
 * `deps` should include every input that changes the request (filters,
 * ticker, …) so stale results never render.
 */
export function useDatasource<T>(
  run: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
  { enabled = true, debounceMs = 0 }: Options = {},
): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ kind: "idle" });

  useEffect(() => {
    if (!enabled) {
      // Reset to idle off the effect body to avoid a synchronous cascading
      // render flagged by react-hooks/set-state-in-effect.
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) setState({ kind: "idle" });
      });
      return () => {
        cancelled = true;
      };
    }
    const controller = new AbortController();
    let cancelled = false;
    const timer = setTimeout(() => {
      setState({ kind: "loading" });
      run(controller.signal)
        .then((data) => {
          if (!cancelled) setState({ kind: "success", data });
        })
        .catch((err: unknown) => {
          if (cancelled || controller.signal.aborted) return;
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : "Request failed",
          });
        });
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, debounceMs, ...deps]);

  return state;
}
