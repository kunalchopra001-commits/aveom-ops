/**
 * Allow the web app origin to fetch files (report downloads) from the Storage
 * bucket. Run once (needs functions/serviceAccountKey.json):
 *   node scripts/set-cors.mjs
 */
import { readFileSync } from "node:fs";

const key = JSON.parse(readFileSync(new URL("../serviceAccountKey.json", import.meta.url)));
const { Storage } = await import("@google-cloud/storage");
const storage = new Storage({ projectId: key.project_id, credentials: key });

const bucketName = `${key.project_id}.firebasestorage.app`;
const cors = [
  {
    origin: [
      `https://${key.project_id}.web.app`,
      `https://${key.project_id}.firebaseapp.com`,
      "http://localhost:5173",
    ],
    method: ["GET", "HEAD"],
    responseHeader: ["Content-Type", "Content-Disposition", "Content-Length"],
    maxAgeSeconds: 3600,
  },
];

await storage.bucket(bucketName).setCorsConfiguration(cors);
const [meta] = await storage.bucket(bucketName).getMetadata();
console.log(`CORS set on ${bucketName}:`);
console.log(JSON.stringify(meta.cors, null, 2));
process.exit(0);
