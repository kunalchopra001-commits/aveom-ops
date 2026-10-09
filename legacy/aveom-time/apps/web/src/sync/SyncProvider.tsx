import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "@/firebase";
import { useAuth } from "@/auth/AuthProvider";
import {
  COL,
  intervalsOverlap,
  type Project,
  type Shift,
  type ShiftFlag,
} from "@shared";
import {
  enqueue as enqueueEntry,
  listOutbox,
  onOutboxChange,
  patchEntry,
  removeEntry,
  type OutboxDraft,
  type OutboxEntry,
} from "@/lib/outbox";

const LAST_SYNCED_KEY = "aveom-last-synced";

interface SyncState {
  entries: OutboxEntry[];
  pendingCount: number;
  rejectedCount: number;
  lastSyncedAt: number | null;
  flushing: boolean;
  enqueue: (id: string, draft: OutboxDraft) => Promise<void>;
  flushNow: () => void;
  retry: (id: string) => Promise<void>;
  discard: (id: string) => Promise<void>;
}

const Ctx = createContext<SyncState | null>(null);

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

const REJECT_CODES = new Set(["permission-denied", "failed-precondition", "not-found", "invalid-argument"]);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [flushing, setFlushing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(() => {
    const v = Number(localStorage.getItem(LAST_SYNCED_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  });
  const busy = useRef(false);

  const reload = useCallback(async () => setEntries(await listOutbox()), []);

  useEffect(() => {
    reload();
    return onOutboxChange(reload);
  }, [reload]);

  const flush = useCallback(async () => {
    if (busy.current || !navigator.onLine || !user || !profile) return;
    busy.current = true;
    setFlushing(true);
    try {
      const pending = (await listOutbox()).filter((e) => e.status === "pending");
      for (const entry of pending) {
        try {
          await patchEntry(entry.id, { status: "syncing" });

          // Already on the server? (a queued Firestore write may have landed)
          const existing = await getDoc(doc(db, COL.shifts, entry.id)).catch(() => null);
          if (existing?.exists()) {
            await removeEntry(entry.id);
            continue;
          }

          const flags: ShiftFlag[] = [...entry.draft.flags.filter((f) => f.type === "long_shift")];

          // Re-check the project at sync time.
          const projSnap = await getDoc(doc(db, COL.projects, entry.draft.projectId));
          const proj = projSnap.exists() ? (projSnap.data() as Project) : null;
          if (!proj) {
            await patchEntry(entry.id, { status: "rejected", error: "That project no longer exists." });
            continue;
          }
          if (proj.locked) flags.push({ type: "locked_project", note: "Project was locked before this synced." });

          // Overlap against the employee's server shifts.
          const mine = await getDocs(
            query(
              collection(db, COL.shifts),
              where("employeeUid", "==", user.uid),
              where("deleted", "==", false),
              orderBy("startAt", "desc"),
            ),
          );
          const clash = mine.docs
            .map((d) => d.data() as Shift)
            .some((s) => intervalsOverlap(entry.draft.startAt, entry.draft.endAt, s.startAt, s.endAt));
          if (clash) flags.push({ type: "overlap", note: "Overlaps another shift you logged." });

          const now = Date.now();
          const shift: Shift = {
            id: entry.id,
            employeeUid: user.uid,
            employeeName: profile.officialName ?? profile.email,
            projectId: proj.id,
            projectName: proj.name,
            startAt: entry.draft.startAt,
            endAt: entry.draft.endAt,
            rawMinutes: entry.draft.rawMinutes,
            totalHours: entry.draft.totalHours,
            wageRate: entry.draft.wageRate,
            wageAmount: entry.draft.wageAmount,
            flags,
            enteredAt: entry.enteredAt,
            createdAt: now,
            deleted: false,
          };

          await withTimeout(setDoc(doc(db, COL.shifts, entry.id), shift), 20000);
          await removeEntry(entry.id);
          const ts = Date.now();
          setLastSyncedAt(ts);
          localStorage.setItem(LAST_SYNCED_KEY, String(ts));
        } catch (err: unknown) {
          const code = (err as { code?: string }).code ?? "";
          const message = (err as { message?: string }).message ?? "Could not sync.";
          if (REJECT_CODES.has(code)) {
            await patchEntry(entry.id, {
              status: "rejected",
              error:
                code === "permission-denied"
                  ? "The office declined this — your account may be blocked or not approved yet."
                  : message,
            });
          } else {
            // transient (offline mid-flush, timeout) — leave for the next pass
            await patchEntry(entry.id, { status: "pending", attempts: entry.attempts + 1 });
            break;
          }
        }
      }
    } finally {
      busy.current = false;
      setFlushing(false);
    }
  }, [user, profile]);

  // triggers
  useEffect(() => {
    flush();
    const onOnline = () => flush();
    const onVisible = () => document.visibilityState === "visible" && flush();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    const iv = window.setInterval(() => navigator.onLine && flush(), 45000);

    // best-effort background sync registration
    navigator.serviceWorker?.ready
      .then((reg) => (reg as unknown as { sync?: { register: (t: string) => Promise<void> } }).sync?.register("aveom-flush"))
      .catch(() => {});

    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(iv);
    };
  }, [flush]);

  const value = useMemo<SyncState>(() => {
    const pendingCount = entries.filter((e) => e.status !== "rejected").length;
    const rejectedCount = entries.filter((e) => e.status === "rejected").length;
    return {
      entries,
      pendingCount,
      rejectedCount,
      lastSyncedAt,
      flushing,
      enqueue: async (id, draft) => {
        await enqueueEntry(id, draft);
        flush();
      },
      flushNow: () => {
        flush();
      },
      retry: async (id) => {
        await patchEntry(id, { status: "pending", error: undefined });
        flush();
      },
      discard: (id) => removeEntry(id),
    };
  }, [entries, lastSyncedAt, flushing, flush]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSync(): SyncState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSync must be used inside <SyncProvider>");
  return v;
}
