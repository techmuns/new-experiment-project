import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { HostContextProvider } from "./state/HostContext";
import { MemoProjectProvider } from "./state/MemoProjectContext";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HostContextProvider>
      <BrowserRouter>
        <MemoProjectProvider>
          <App />
        </MemoProjectProvider>
      </BrowserRouter>
    </HostContextProvider>
  </StrictMode>,
);
