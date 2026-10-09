import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
} from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const config = {
  apiKey: import.meta.env.VITE_FB_API_KEY ?? "demo-key",
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN ?? "demo-aveom-ops.firebaseapp.com",
  projectId: import.meta.env.VITE_FB_PROJECT_ID ?? "demo-aveom-ops",
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET ?? "demo-aveom-ops.appspot.com",
  messagingSenderId: import.meta.env.VITE_FB_MSG_SENDER_ID ?? "000000000000",
  appId: import.meta.env.VITE_FB_APP_ID ?? "1:000000000000:web:0000000000000000",
};

const REGION = import.meta.env.VITE_FUNCTIONS_REGION ?? "asia-south1";

export const app = initializeApp(config);
export const auth = getAuth(app);

/** Firestore with a persistent (IndexedDB) cache so the shift screens work offline. */
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const storage = getStorage(app);
export const functions = getFunctions(app, REGION);

export const USING_EMULATORS = import.meta.env.VITE_USE_EMULATORS === "1";

if (USING_EMULATORS) {
  const port = (v: string | undefined, d: number) => Number(v) || d;
  const env = import.meta.env;
  connectAuthEmulator(auth, `http://127.0.0.1:${port(env.VITE_EMU_AUTH_PORT, 9099)}`, { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", port(env.VITE_EMU_FIRESTORE_PORT, 8080));
  connectStorageEmulator(storage, "127.0.0.1", port(env.VITE_EMU_STORAGE_PORT, 9199));
  connectFunctionsEmulator(functions, "127.0.0.1", port(env.VITE_EMU_FUNCTIONS_PORT, 5001));
}
