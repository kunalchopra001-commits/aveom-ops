import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import "./styles.css";
import { AuthProvider } from "@/auth/AuthProvider";
import { App } from "@/App";

function Root() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [update, setUpdate] = useState<(() => void) | null>(null);

  React.useEffect(() => {
    const updateSW = registerSW({
      onNeedRefresh() {
        setUpdate(() => () => updateSW(true));
        setNeedRefresh(true);
      },
    });
  }, []);

  return (
    <>
      {needRefresh ? (
        <div
          style={{
            position: "fixed",
            insetInline: 0,
            bottom: 0,
            zIndex: 50,
            display: "flex",
            justifyContent: "center",
            padding: "0.6rem",
          }}
        >
          <div className="panel row" style={{ gap: "0.8rem" }}>
            <span className="small">A new version of AVEOM TIME is ready.</span>
            <button className="btn-primary btn-sm" onClick={() => update?.()}>
              Update now
            </button>
          </div>
        </div>
      ) : null}
      <AuthProvider>
        <App />
      </AuthProvider>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  </React.StrictMode>,
);
