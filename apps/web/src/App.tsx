import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { FullScreenLoader, BrandMark } from "@/components/ui";
import { Shell } from "@/components/Shell";

import { Login } from "@/pages/Login";
import { Home } from "@/pages/Home";
import { Account } from "@/pages/Account";
import { LogShift } from "@/pages/shifts/LogShift";
import { MyShifts } from "@/pages/shifts/MyShifts";
import { AllShifts } from "@/pages/shifts/AllShifts";
import { MyPetty } from "@/pages/petty/MyPetty";
import { NewBill } from "@/pages/petty/NewBill";
import { SendMoney } from "@/pages/petty/SendMoney";
import { PettyOverview } from "@/pages/petty/PettyOverview";
import { People } from "@/pages/manage/People";
import { Projects } from "@/pages/manage/Projects";
import { Logs } from "@/pages/manage/Logs";
import { Reports } from "@/pages/Reports";

export function App() {
  const { loading, user, profile, isAdmin, isOwner, isViewer, canShifts, canPetty, signOut } = useAuth();

  if (loading) return <FullScreenLoader label="Starting AVEOM OPS" />;

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (!profile || !profile.active) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <BrandMark />
          <div className="card stack">
            <h2>{profile ? "Account deactivated" : "Account not set up"}</h2>
            <p className="muted">
              {profile
                ? "Your access has been switched off. Speak to the Production Manager if you think this is a mistake."
                : "This login exists but has no profile yet. Ask the Production Manager to set it up."}
            </p>
            <button className="btn btn-secondary" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const gate = (ok: boolean, el: ReactNode) => (ok ? el : <Navigate to="/" replace />);

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Home />} />
        <Route path="log" element={gate(canShifts, <LogShift />)} />
        <Route path="my-shifts" element={gate(canShifts, <MyShifts />)} />
        <Route path="my-petty" element={gate(canPetty, <MyPetty />)} />
        <Route path="my-petty/new-bill" element={gate(canPetty, <NewBill />)} />
        <Route path="send" element={gate(isOwner, <SendMoney />)} />
        <Route path="petty" element={gate(isViewer, <PettyOverview />)} />
        <Route path="shifts" element={gate(isViewer, <AllShifts />)} />
        <Route path="reports" element={gate(isViewer, <Reports />)} />
        <Route path="people" element={gate(isAdmin, <People />)} />
        <Route path="projects" element={gate(isAdmin, <Projects />)} />
        <Route path="logs" element={gate(isAdmin, <Logs />)} />
        <Route path="account" element={<Account />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
