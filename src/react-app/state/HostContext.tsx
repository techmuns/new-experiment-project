import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  initMunshotSdk,
  type HostContext,
  type MunshotSdk,
  type SdkStatus,
} from "../lib/munshotSdk";

const DASHBOARD_METADATA = {
  id: "memo-intelligence-dashboard",
  name: "Memo Intelligence Dashboard",
  version: "1.0.0",
  capabilities: [
    "portfolio.ticker.select",
    "analytics.filter.change",
    "dashboard.metric",
    "dashboard.error",
  ],
};

interface HostContextValue {
  status: SdkStatus;
  context: HostContext;
  /** Convenience getter for the bearer token used by datasource calls. */
  getToken: () => string | undefined;
  /** Re-pull a fresh context snapshot from the host. */
  refresh: () => Promise<HostContext>;
  /** Publish a namespaced pub/sub event to the host. */
  publish: (topic: string, payload?: unknown) => void;
}

const Ctx = createContext<HostContextValue | null>(null);

export function HostContextProvider({ children }: { children: ReactNode }) {
  const sdkRef = useRef<MunshotSdk | null>(null);
  const [status, setStatus] = useState<SdkStatus>("connecting");
  const [context, setContext] = useState<HostContext>({});

  useEffect(() => {
    const sdk = initMunshotSdk(DASHBOARD_METADATA);
    sdkRef.current = sdk;

    const offCtx = sdk.onContext(setContext);
    const offStatus = sdk.onStatus(setStatus);

    // Capture the initial snapshot off the effect body so we don't trigger a
    // synchronous cascading render; subsequent changes arrive via the
    // subscriptions above.
    queueMicrotask(() => {
      setStatus(sdk.status);
      setContext(sdk.getContext());
    });

    return () => {
      offCtx();
      offStatus();
      sdk.disconnect();
      sdkRef.current = null;
    };
  }, []);

  const value = useMemo<HostContextValue>(
    () => ({
      status,
      context,
      getToken: () => sdkRef.current?.getContext().session?.token,
      refresh: async () => {
        const sdk = sdkRef.current;
        if (!sdk) return {};
        return sdk.requestContext();
      },
      publish: (topic, payload) => sdkRef.current?.publish(topic, payload),
    }),
    [status, context],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHost(): HostContextValue {
  const value = useContext(Ctx);
  if (!value) {
    throw new Error("useHost must be used within a HostContextProvider");
  }
  return value;
}
