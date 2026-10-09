# AVEOM TIME — Firebase setup (final environment)

This stands up the real project you'll actually use. Work top to bottom.
Steps marked **[you]** need the Firebase console or your own terminal; steps
marked **[claude]** I can run once the earlier steps are done.

---

## 1. Create the project — [you]

1. <https://console.firebase.google.com> → **Add project**. Name it (e.g.
   `aveom-time`). Note the **Project ID** it generates.
2. **Upgrade to Blaze (pay-as-you-go).** Cloud Functions, Cloud Scheduler and the
   OpenAI call from a function all need it. Set a **budget alert** (e.g. USD 15/mo)
   under *Billing* while you're there — real usage at 1–35 people is well under that.

## 2. Turn on the services — [you]

In the console for this project:

1. **Build → Authentication → Get started →** enable **Email/Password**.
2. **Build → Firestore Database → Create database →**
   - Start in **production mode**
   - Location: **`asia-south1`**  ← permanent, do not change
3. **Build → Storage → Get started →** accept the default bucket (same location).
4. **Authentication → Settings → Authorized domains** — your hosting domains
   (`<project>.web.app`, `<project>.firebaseapp.com`) are added automatically.
   Add a custom domain here later if you use one.

## 3. Register the web app — [you]

**Project settings (gear icon) → General → Your apps → Add app → Web (`</>`)**.
Skip Hosting setup in that wizard. Copy the `firebaseConfig` values — send me:

```
projectId          = ...
apiKey             = ...
authDomain         = ...
storageBucket      = ...   (looks like <project>.firebasestorage.app)
messagingSenderId  = ...
appId              = ...
```

(These are not secrets — they ship in the app bundle.)

## 4. Log in the CLI — [you]

In a terminal on this machine:

```bash
firebase login
```

Complete the browser sign-in. After this I can run deploys.

## 5. OpenAI key for OCR — [you]

```bash
cd functions
firebase functions:secrets:set OPENAI_API_KEY
```

Paste your OpenAI key when prompted. (I never see or handle the key.)

## 6. Point the repo at the project — [claude]

Once I have the values from step 3, I will:

- write your Project ID into `.firebaserc`
- create `apps/web/.env.production` from the example with your web config
- `firebase deploy --only firestore:rules,firestore:indexes,storage`

## 7. First functions + hosting deploy — [you] (once, interactive)

The first Functions deploy asks permission to enable a handful of Google APIs
(Cloud Functions, Cloud Build, Artifact Registry, Cloud Run, Eventarc, Pub/Sub,
Cloud Scheduler). Run it yourself so you can answer the prompts:

```bash
npm run build
firebase deploy --only functions,hosting
```

After this first run I can handle subsequent deploys.

## 8. Create the manager accounts — [you]

1. **Project settings → Service accounts → Generate new private key.**
   Save it as `functions/serviceAccountKey.json` (already gitignored).
2. ```bash
   cd functions
   node scripts/bootstrap-prod.mjs ops@you.com founder@you.com accountant@you.com
   ```
   This creates the three logins (temp passwords printed once), gives them their
   roles (`ops` / `founder` / `accountant`), and sets an initial 6-digit
   registration code (also printed).
   Optionally seed projects: `PROJECTS="Site A,Site B" node scripts/bootstrap-prod.mjs ...`
3. Each manager opens the app URL, signs in, and uses **Forgot password** to set
   their own password.
4. Delete `functions/serviceAccountKey.json` when you're done (or keep it
   somewhere safe for future admin scripts).

## 8b. Allow report downloads (bucket CORS) — [claude, one-off]

Report `.xlsx` files are fetched from Cloud Storage by the browser, which needs a
CORS rule on the bucket:

```bash
cd functions
node scripts/set-cors.mjs        # needs serviceAccountKey.json
```

## 9. Go live

1. Sign in as the Operations Manager → **Projects** → add your real project list,
   confirm the registration code.
2. Share the hosting URL (`https://<project>.web.app`) + the 6-digit code with
   each employee.
3. iPhone users: open in Safari → **Share → Add to Home Screen**. Android users
   get an install prompt.

---

## Redeploying after code changes — [claude]

```bash
npm run build
firebase deploy --only hosting,functions,firestore:rules,firestore:indexes,storage
```

Hosting serves `index.html` as `no-cache` and hashed assets as `immutable`, and
the service worker shows an "Update now" prompt — so updates reach every phone on
next open with no cache clearing.

## Still to build (Phase 5)

Rasterised PWA icons (`apps/web/public/icons/`), a health check on the hourly
`purgeBlockedIds` job, and a scheduled Firestore backup export. None block launch.

## Parked questions (spec §12)

Contact-number edge cases · whether "request a correction" also emails managers ·
Arabic UI · report filename tweaks · account number mandatory vs optional.
