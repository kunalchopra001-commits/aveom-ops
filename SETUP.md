# Going live — step by step

Run the commands in **PowerShell** from the repo folder unless it says otherwise.

## 1. Firebase project (in the browser)

1. <https://console.firebase.google.com> → **Add project** (e.g. `aveom-ops`).
2. Upgrade to **Blaze** (pay-as-you-go). Set a budget alert (e.g. USD 10) under
   Google Cloud → Billing → Budgets.
3. **Build → Authentication → Get started → Email/Password → Enable.**
4. **Build → Firestore Database → Create** → location **asia-south1 (Mumbai)** → production mode.
5. **Build → Storage → Get started** → same location.
6. **Project settings → Your apps → Web (</>)** → register an app (no hosting setup needed here).

## 2. Connect the repo

```powershell
firebase login
firebase use --add            # pick the new project, alias "default"
firebase apps:sdkconfig WEB   # copy the values into apps/web/.env.production (see .env.example)
```

## 3. Deploy

```powershell
npm run install:all
npm run build
firebase deploy --only "firestore,storage,functions,hosting"
```

Functions deploy can time out on the first try ("User code failed to load") — just run it again.

## 4. Create your Production Manager login (once)

1. Firebase console → Project settings → **Service accounts → Generate new private key**.
2. Save it as `functions/serviceAccountKey.json` (it's git-ignored — never commit it).
3. Run and answer the prompts:

   ```powershell
   node functions/scripts/create-admin.mjs
   ```

4. **Delete `functions/serviceAccountKey.json`** — it's a full admin key.

Everything else — other people, their access, passwords, projects — is done in the app.

## 5. First steps in the app

1. Sign in at `https://<project-id>.web.app` with the username you just created.
2. **Projects** → add your current projects.
3. **People & access** → add Inaye as **Owner**, the accountant as **Accountant**, and crew as
   **Team member** with Shifts and/or Petty cash switched on. Copy each login and send it privately.
4. On phones: open the link → browser menu → **Add to Home Screen**.
