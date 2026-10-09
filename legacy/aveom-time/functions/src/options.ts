import { setGlobalOptions } from "firebase-functions/v2";

// MUST be imported before any function module is evaluated (see index.ts) so the
// region applies to every function. asia-south1 = same region as Firestore + Storage.
setGlobalOptions({ region: "asia-south1", maxInstances: 10 });
