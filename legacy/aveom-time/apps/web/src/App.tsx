import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { FullScreenLoader } from "@/components/ui";

import { Login } from "@/pages/Login";
import { Register } from "@/pages/Register";
import { PendingApproval, Blocked } from "@/pages/Gate";

import { EmployeeHome } from "@/pages/employee/EmployeeHome";
import { NewShift } from "@/pages/employee/NewShift";
import { MyShifts } from "@/pages/employee/MyShifts";
import { ProfileTab } from "@/pages/employee/ProfileTab";
import { Onboarding } from "@/pages/employee/Onboarding";

import { AdminHome } from "@/pages/admin/AdminHome";
import { Registrations } from "@/pages/admin/Registrations";
import { Employees } from "@/pages/admin/Employees";
import { EmployeeDetail } from "@/pages/admin/EmployeeDetail";
import { Projects } from "@/pages/admin/Projects";
import { Shifts } from "@/pages/admin/Shifts";
import { Reports } from "@/pages/admin/Reports";
import { AuditLog } from "@/pages/admin/AuditLog";

export function App() {
  const { loading, user, isManager, profile, profileLoading } = useAuth();

  if (loading) return <FullScreenLoader label="Starting AVEOM TIME" />;

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (isManager) {
    return (
      <Routes>
        <Route path="/admin" element={<AdminHome />}>
          <Route index element={<Navigate to="registrations" replace />} />
          <Route path="registrations" element={<Registrations />} />
          <Route path="employees" element={<Employees />} />
          <Route path="employees/:uid" element={<EmployeeDetail />} />
          <Route path="shifts" element={<Shifts />} />
          <Route path="projects" element={<Projects />} />
          <Route path="reports" element={<Reports />} />
          <Route path="audit" element={<AuditLog />} />
        </Route>
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    );
  }

  // ---- employee ----
  if (profileLoading && !profile) return <FullScreenLoader label="Loading your profile" />;
  if (!profile) return <PendingApproval />;
  if (profile.status === "blocked") return <Blocked />;
  if (profile.status === "pending") return <PendingApproval />;

  const canEditProfile = profile.status === "approved" && !profile.profileLocked;
  if (canEditProfile) {
    return (
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<EmployeeHome />}>
        <Route index element={<Navigate to="new" replace />} />
        <Route path="new" element={<NewShift />} />
        <Route path="shifts" element={<MyShifts />} />
        <Route path="profile" element={<ProfileTab />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
