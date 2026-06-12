import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { HostContextProvider } from "./state/HostContext";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HostContextProvider>
      <App />
    </HostContextProvider>
  </StrictMode>,
);
