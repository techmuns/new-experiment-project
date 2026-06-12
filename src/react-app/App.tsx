import { DashboardPage } from "./pages/DashboardPage";

// Single embedded dashboard surface. No router/sidebar/marketing shell — the
// Munshot host owns navigation; this app renders the dashboard inside the
// host iframe and consumes context from the SDK.
function App() {
  return <DashboardPage />;
}

export default App;
