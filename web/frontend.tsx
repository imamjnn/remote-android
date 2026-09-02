import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { api } from "./api";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";

type AuthState = { status: "loading" } | { status: "anon" } | { status: "in"; email: string };

function App() {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    api
      .me()
      .then((me) => setState({ status: "in", email: me.email }))
      .catch(() => setState({ status: "anon" }));
  }, []);

  if (state.status === "loading") return null;

  if (state.status === "anon") {
    return <LoginPage onLoggedIn={() => api.me().then((me) => setState({ status: "in", email: me.email }))} />;
  }

  return <DashboardPage email={state.email} onLogout={() => api.logout().then(() => setState({ status: "anon" }))} />;
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
