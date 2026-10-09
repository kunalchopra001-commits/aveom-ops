import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

if (getApps().length === 0) {
  initializeApp();
}

export const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
export const authAdmin = getAuth();
export const storageAdmin = getStorage();

export const nowMs = (): number => Date.now();

/** Generate a short id for audit / report docs. */
export function randomId(prefix = ""): string {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
