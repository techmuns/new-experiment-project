// Combine a user-supplied AbortSignal with a per-request timeout. Returns a
// derived signal that aborts on whichever fires first, plus a `clear()` to
// release the timer and the user-signal listener. Used by both the
// Anthropic and OpenAI providers to enforce a 60s ceiling without losing
// user-initiated cancellations.

export interface CombinedAbort {
  signal: AbortSignal;
  clear: () => void;
}

export function combineWithTimeout(
  userSignal: AbortSignal | undefined,
  timeoutMs: number,
): CombinedAbort {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException("Timeout", "TimeoutError"));
  }, timeoutMs);

  let forwardUser: (() => void) | null = null;
  if (userSignal) {
    if (userSignal.aborted) {
      controller.abort(userSignal.reason);
    } else {
      forwardUser = () => controller.abort(userSignal.reason);
      userSignal.addEventListener("abort", forwardUser, { once: true });
    }
  }

  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timer);
      if (userSignal && forwardUser) {
        userSignal.removeEventListener("abort", forwardUser);
      }
    },
  };
}

export function isTimeoutError(err: unknown): boolean {
  return err instanceof Error && err.name === "TimeoutError";
}
