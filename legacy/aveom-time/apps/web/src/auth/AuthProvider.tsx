import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  onIdTokenChanged,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/firebase";
import { COL, MANAGER_ROLES, type EmployeeProfile, type Role } from "@shared";

interface AuthState {
  loading: boolean;
  user: User | null;
  role: Role;
  isManager: boolean;
  isAdmin: boolean;
  /** employee profile doc — only populated for the `employee` role. */
  profile: EmployeeProfile | null;
  profileLoading: boolean;
  signOut: () => Promise<void>;
  refreshClaims: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>("employee");
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const token = await u.getIdTokenResult();
        setRole(((token.claims.role as Role) ?? "employee") as Role);
      } else {
        setRole("employee");
        setProfile(null);
      }
      setLoading(false);
    });
  }, []);

  // Keep role in sync if the token is refreshed (e.g. claims changed server-side).
  useEffect(() => {
    return onIdTokenChanged(auth, async (u) => {
      if (!u) return;
      const token = await u.getIdTokenResult();
      setRole(((token.claims.role as Role) ?? "employee") as Role);
    });
  }, []);

  // Subscribe to the employee profile doc for non-managers.
  useEffect(() => {
    if (!user || MANAGER_ROLES.includes(role)) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    const ref = doc(db, COL.employees, user.uid);
    return onSnapshot(
      ref,
      (snap) => {
        setProfile(snap.exists() ? (snap.data() as EmployeeProfile) : null);
        setProfileLoading(false);
      },
      () => setProfileLoading(false),
    );
  }, [user, role]);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      user,
      role,
      isManager: MANAGER_ROLES.includes(role),
      isAdmin: role === "ops" || role === "founder",
      profile,
      profileLoading,
      signOut: () => fbSignOut(auth),
      refreshClaims: async () => {
        if (auth.currentUser) {
          const t = await auth.currentUser.getIdTokenResult(true);
          setRole(((t.claims.role as Role) ?? "employee") as Role);
        }
      },
    }),
    [loading, user, role, profile, profileLoading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}
