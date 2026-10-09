import { setGlobalOptions } from "firebase-functions/v2";

// MUST be imported before any function module is evaluated (see index.ts) so the
// region applies to every function. Keep it in the same region as Firestore + Storage.
export const REGION = "asia-south1";
setGlobalOptions({ region: REGION, maxInstances: 10 });
