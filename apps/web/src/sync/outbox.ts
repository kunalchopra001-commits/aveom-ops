import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ShiftFlag } from "@shared";

/** The part of a shift the employee actually enters / we can compute on-device. */
export interface OutboxDraft {
  projectId: string;
  projectName: string;
  startAt: number;
  endAt: number;
  rawMinutes: number;
  totalHours: number;
  wageRate: number;
  wageAmount: number;
  flags: ShiftFlag[];
}

export type OutboxStatus = "pending" | "syncing" | "rejected";

export interface OutboxEntry {
  /** client-generated UUID — also the Firestore shift doc id (idempotent). */
  id: string;
  /** Who entered it — a shared phone must never sync one person's shift as another's. */
  uid: string;
  draft: OutboxDraft;
  status: OutboxStatus;
  error?: string;
  attempts: number;
  enteredAt: number;
  updatedAt: number;
}

interface Schema extends DBSchema {
  shifts: { key: string; value: OutboxEntry };
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;
function database() {
  if (!dbPromise) {
    dbPromise = openDB<Schema>("aveom-ops-outbox", 1, {
      upgrade(db) {
        db.createObjectStore("shifts", { keyPath: "id" });
      },
    });
  }
  return dbPromise;
}

// ---- change notifications (this tab + other tabs) ----
const listeners = new Set<() => void>();
const channel: BroadcastChannel | null =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("aveom-ops-outbox") : null;
if (channel) channel.onmessage = () => listeners.forEach((fn) => fn());

function emit() {
  listeners.forEach((fn) => fn());
  channel?.postMessage("changed");
}

export function onOutboxChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---- operations ----
export async function enqueue(id: string, uid: string, draft: OutboxDraft): Promise<void> {
  const db = await database();
  const now = Date.now();
  await db.put("shifts", { id, uid, draft, status: "pending", attempts: 0, enteredAt: now, updatedAt: now });
  emit();
}

export async function listOutbox(uid: string): Promise<OutboxEntry[]> {
  const db = await database();
  const all = await db.getAll("shifts");
  return all.filter((e) => e.uid === uid).sort((a, b) => b.enteredAt - a.enteredAt);
}

export async function getEntry(id: string): Promise<OutboxEntry | undefined> {
  return (await database()).get("shifts", id);
}

export async function patchEntry(id: string, patch: Partial<OutboxEntry>): Promise<void> {
  const db = await database();
  const cur = await db.get("shifts", id);
  if (!cur) return;
  await db.put("shifts", { ...cur, ...patch, updatedAt: Date.now() });
  emit();
}

export async function removeEntry(id: string): Promise<void> {
  const db = await database();
  await db.delete("shifts", id);
  emit();
}
