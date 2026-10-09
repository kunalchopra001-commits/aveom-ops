import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import "./styles.css";
import { AuthProvider } from "@/auth/AuthProvider";
import { SyncProvider } from "@/sync/SyncProvider";
import { App } from "@/App";
import { DemoBar } from "@/components/ui";

// Apply the saved theme before first paint.
try {
  const t = localStorage.getItem("aveom-ops-theme");
  if (t) document.documentElement.setAttribute("data-theme", t);
} catch {
  /* storage unavailable */
}

function UpdatePrompt() {
  const [update, setUpdate] = useState<(() => void) | null>(null);
  useEffect(() => {
    const updateSW = registerSW({
      onNeedRefresh() {
        setUpdate(() => () => updateSW(true));
      },
    });
  }, []);
  if (!update) return null;
  return (
    <div className="update-bar">
      <div className="card">
        <span className="small">A new version of AVEOM OPS is ready.</span>
        <button className="btn btn-primary btn-sm" onClick={() => update()}>
          Update now
        </button>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <DemoBar />
      <AuthProvider>
        <SyncProvider>
          <App />
          <UpdatePrompt />
        </SyncProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
