import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

if (getApps().length === 0) initializeApp();

export const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
export const authAdmin = getAuth();
export const storageAdmin = getStorage();

export const nowMs = (): number => Date.now();

export function randomId(prefix = ""): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
