import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/firebase";
import { api } from "@/lib/api";
import {
  COL,
  isValidUsername,
  isViewer,
  normalizeUsername,
  usernameToEmail,
  type Claims,
  type Role,
  type UserProfile,
} from "@shared";

interface AuthState {
  loading: boolean;
  user: User | null;
  profile: UserProfile | null;
  claims: Claims | null;
  role: Role | null;
  isAdmin: boolean;
  isOwner: boolean;
  isViewer: boolean;
  canShifts: boolean;
  canPetty: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [claims, setClaims] = useState<Claims | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const seenVersion = useRef<number | null>(null);

  useEffect(
    () =>
      onAuthStateChanged(auth, async (u) => {
        setUser(u);
        if (u) {
          const t = await u.getIdTokenResult();
          setClaims(readClaims(t.claims));
        } else {
          setClaims(null);
          setProfile(null);
          setProfileLoaded(false);
          seenVersion.current = null;
        }
        setLoading(false);
      }),
    [],
  );

  // Live user record. When the admin changes someone's access, claimsVersion is bumped:
  // refresh the token so security rules see the new permissions straight away.
  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      doc(db, COL.users, user.uid),
      async (snap) => {
        const p = snap.exists() ? (snap.data() as UserProfile) : null;
        setProfile(p);
        setProfileLoaded(true);
        if (p && seenVersion.current !== null && p.claimsVersion !== seenVersion.current) {
          const t = await user.getIdTokenResult(true).catch(() => null);
          if (t) setClaims(readClaims(t.claims));
        }
        if (p) seenVersion.current = p.claimsVersion;
      },
      () => setProfileLoaded(true),
    );
  }, [user]);

  const value = useMemo<AuthState>(() => {
    // The user record is the source of truth for the UI; claims mirror it for security rules.
    const role = profile?.role ?? claims?.role ?? null;
    const perms = profile?.perms ?? (claims ? { shifts: claims.shifts, petty: claims.petty } : null);
    return {
      loading: loading || (!!user && !profileLoaded),
      user,
      profile,
      claims,
      role,
      isAdmin: role === "admin",
      isOwner: role === "owner",
      isViewer: isViewer(role),
      canShifts: !!perms?.shifts,
      canPetty: !!perms?.petty,
      signIn: async (username, password) => {
        const name = normalizeUsername(username);
        if (!isValidUsername(name)) throw new Error("Check your username.");
        try {
          await signInWithEmailAndPassword(auth, usernameToEmail(name), password);
        } catch (e) {
          api.recordSignInFailed({ username: name }).catch(() => {});
          const code = (e as { code?: string }).code ?? "";
          if (code === "auth/user-disabled") throw new Error("This account has been deactivated.");
          if (code === "auth/too-many-requests") {
            throw new Error("Too many attempts. Wait a few minutes and try again.");
          }
          if (code === "auth/network-request-failed") {
            throw new Error("No connection. You need signal to sign in the first time.");
          }
          throw new Error("Wrong username or password.");
        }
        api.recordSignIn({}).catch(() => {});
      },
      signOut: async () => {
        await api.recordSignOut({}).catch(() => {});
        await fbSignOut(auth);
      },
    };
  }, [loading, user, profile, profileLoaded, claims]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function readClaims(c: Record<string, unknown>): Claims | null {
  if (typeof c.role !== "string") return null;
  return { role: c.role as Role, shifts: c.shifts === true, petty: c.petty === true };
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}
