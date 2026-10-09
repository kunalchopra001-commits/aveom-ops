import { useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { useUsers } from "@/lib/queries";
import { api, errMessage } from "@/lib/api";
import { Banner, Chip, Empty, Field, Loading, PageHead, Segmented, Sheet, Spinner, initials } from "@/components/ui";
import { IconUsers } from "@/components/icons";
import {
  ASSIGNABLE_ROLES,
  MIN_PASSWORD_LENGTH,
  ROLE_LABEL,
  canHoldPetty,
  isValidUaeIban,
  isValidUsername,
  normalizeContactNumber,
  normalizeUsername,
  type BankDetails,
  type Perms,
  type Role,
  type UserProfile,
} from "@shared";

const WORDS = ["sand", "dune", "palm", "reef", "falcon", "pearl", "oasis", "harbor", "cedar", "amber", "stone", "tide", "breeze", "coral", "spice", "marina"];

function generatePassword(): string {
  const r = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  const w = () => {
    const x = WORDS[r(WORDS.length)];
    return x[0].toUpperCase() + x.slice(1);
  };
  return `${w()}-${w()}-${1000 + r(9000)}`;
}

type Filter = "active" | "inactive";

export function People() {
  const users = useUsers();
  const [filter, setFilter] = useState<Filter>("active");
  const [editing, setEditing] = useState<UserProfile | "new" | null>(null);
  const [created, setCreated] = useState<{ name: string; username: string; password: string } | null>(null);

  const list = useMemo(
    () =>
      (users.data ?? [])
        .filter((u) => (filter === "active" ? u.active : !u.active))
        .sort((a, b) => (a.role === "admin" ? -1 : b.role === "admin" ? 1 : a.displayName.localeCompare(b.displayName))),
    [users.data, filter],
  );
  const inactiveCount = (users.data ?? []).filter((u) => !u.active).length;

  return (
    <div className="page">
      <PageHead
        title="People & access"
        sub="Create logins and choose what each person can use. Only you can see this page."
        actions={
          <button className="btn btn-primary" onClick={() => setEditing("new")}>
            Add person
          </button>
        }
      />
      {created ? (
        <div className="callout stack-sm">
          <h3>Login created for {created.name}</h3>
          <p className="small">Share these with them privately. The password isn't shown again — you can always set a new one.</p>
          <dl className="kv">
            <dt>Username</dt>
            <dd className="num">{created.username}</dd>
            <dt>Password</dt>
            <dd className="num">{created.password}</dd>
          </dl>
          <div className="row">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => navigator.clipboard?.writeText(`Username: ${created.username}\nPassword: ${created.password}\n${location.origin}`)}
            >
              Copy login details
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setCreated(null)}>
              Done
            </button>
          </div>
        </div>
      ) : null}

      {inactiveCount ? (
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          items={[
            { value: "active", label: "Active" },
            { value: "inactive", label: `Deactivated (${inactiveCount})` },
          ]}
        />
      ) : null}

      <div className="card card-tight">
        {users.data === null ? (
          <Loading />
        ) : list.length === 0 ? (
          <Empty icon={<IconUsers />} title="Nobody here yet" />
        ) : (
          <div className="list">
            {list.map((u) => (
              <button key={u.uid} className="list-item" onClick={() => setEditing(u)}>
                <span className="avatar" style={u.active ? undefined : { opacity: 0.4 }}>{initials(u.displayName)}</span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="title">{u.displayName}</span>
                  <span className="sub" style={{ display: "block" }}>
                    @{u.username} · {ROLE_LABEL[u.role]}
                  </span>
                </span>
                <span className="row" style={{ gap: "0.3rem", justifyContent: "flex-end" }}>
                  {u.perms.shifts ? <Chip tone="info">Shifts</Chip> : null}
                  {u.perms.petty ? <Chip tone="pos">Petty cash</Chip> : null}
                  {u.role === "owner" ? <Chip tone="dark">Sends money</Chip> : null}
                  {!u.perms.shifts && !u.perms.petty && u.role === "member" ? <Chip>No access</Chip> : null}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card-flat small muted stack-sm">
        <b className="muted">Who sees what</b>
        <span><b>Owner</b> — sees every report, and is the only person who can send petty cash.</span>
        <span><b>Accountant</b> — sees every report. Can't change anything.</span>
        <span><b>Team member</b> — only what you switch on: logging shifts, petty cash, or both.</span>
        <span>Logs of sign-ins, confirmations and changes are visible only to you.</span>
      </div>

      {editing ? (
        <PersonSheet
          user={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onCreated={(c) => {
            setEditing(null);
            setCreated(c);
          }}
        />
      ) : null}
    </div>
  );
}

function PersonSheet({
  user,
  onClose,
  onCreated,
}: {
  user: UserProfile | null;
  onClose: () => void;
  onCreated: (c: { name: string; username: string; password: string }) => void;
}) {
  const { user: me } = useAuth();
  const isNew = !user;
  const isAdminUser = user?.role === "admin";
  const isSelf = user?.uid === me?.uid;

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [password, setPassword] = useState(isNew ? generatePassword() : "");
  const [role, setRole] = useState<Role>(user?.role ?? "member");
  const [perms, setPerms] = useState<Perms>(user?.perms ?? { shifts: true, petty: false });
  const [contact, setContact] = useState(user?.contactNumber ?? "");
  const [bank, setBank] = useState<BankDetails>(user?.bank ?? {});
  const [notes, setNotes] = useState(user?.notes ?? "");
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const pettyAllowed = canHoldPetty(role);
  const problems: string[] = [];
  if (displayName.trim().length < 2) problems.push("Enter their full name.");
  if (isNew && !isValidUsername(username)) problems.push("Username: 3–30 letters, numbers, dot, dash or underscore.");
  if (isNew && password.length < MIN_PASSWORD_LENGTH) problems.push(`Password: at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (contact.trim() && !normalizeContactNumber(contact)) problems.push("Contact number doesn't look right.");
  if (bank.iban?.trim() && !isValidUaeIban(bank.iban)) problems.push("IBAN isn't a valid UAE IBAN.");

  const cleanBank = (): BankDetails | undefined => {
    const b = Object.fromEntries(Object.entries(bank).map(([k, v]) => [k, (v ?? "").trim() || undefined]));
    return Object.values(b).some(Boolean) ? (b as BankDetails) : undefined;
  };

  async function save() {
    setBusy(true);
    setError("");
    setSaved("");
    const effective = { shifts: perms.shifts, petty: perms.petty && pettyAllowed };
    try {
      if (isNew) {
        const uname = normalizeUsername(username);
        await api.createUser({
          username: uname,
          displayName: displayName.trim(),
          password,
          role,
          perms: effective,
          contactNumber: contact.trim() || undefined,
          bank: cleanBank(),
          notes: notes.trim() || undefined,
        });
        onCreated({ name: displayName.trim(), username: uname, password });
        return;
      }
      await api.updateUser({
        uid: user.uid,
        displayName: displayName.trim(),
        role: isAdminUser ? undefined : role,
        perms: effective,
        contactNumber: contact.trim(),
        bank: cleanBank() ?? {},
        notes: notes.trim(),
      });
      setSaved("Saved.");
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function setPasswordNow() {
    if (!user || !newPassword) return;
    setBusy(true);
    setError("");
    try {
      await api.resetUserPassword({ uid: user.uid, password: newPassword });
      setSaved(`New password set: ${newPassword} — share it with ${user.displayName}. They've been signed out everywhere.`);
      setNewPassword(null);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    if (!user) return;
    const verb = user.active ? "Deactivate" : "Reactivate";
    if (!confirm(`${verb} ${user.displayName}? ${user.active ? "They'll be signed out and can't log in." : ""}`)) return;
    setBusy(true);
    try {
      await api.setUserActive({ uid: user.uid, active: !user.active });
      onClose();
    } catch (e) {
      setError(errMessage(e));
      setBusy(false);
    }
  }

  return (
    <Sheet
      wide
      title={isNew ? "Add a person" : user.displayName}
      sub={isNew ? "They'll sign in with the username and password you set here." : `@${user.username} · ${ROLE_LABEL[user.role]}`}
      onClose={onClose}
      footer={
        <>
          {!isNew && !isSelf ? (
            <button className="btn btn-danger" disabled={busy} onClick={toggleActive} style={{ marginRight: "auto" }}>
              {user.active ? "Deactivate" : "Reactivate"}
            </button>
          ) : null}
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {saved ? "Close" : "Cancel"}
          </button>
          <button className="btn btn-primary" disabled={busy || problems.length > 0} onClick={save}>
            {busy ? <Spinner small /> : isNew ? "Create login" : "Save changes"}
          </button>
        </>
      }
    >
      <div className="stack-lg">
        {error ? <Banner tone="crit">{error}</Banner> : null}
        {saved ? <Banner tone="ok">{saved}</Banner> : null}

        <section className="stack">
          <span className="eyebrow">Login</span>
          <div className="grid grid-2">
            <Field label="Full name">
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} />
            </Field>
            <Field label="Username" hint={isNew ? "Lowercase, no spaces. Can't be changed later." : "Can't be changed."}>
              <input
                value={username}
                disabled={!isNew}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
                autoCapitalize="none"
                spellCheck={false}
              />
            </Field>
          </div>
          {isNew ? (
            <Field label="Password" hint="Suggested password — you can type your own.">
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <input className="num" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPassword(generatePassword())}>
                  New
                </button>
              </div>
            </Field>
          ) : newPassword !== null ? (
            <Field label="New password">
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <input className="num" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy || newPassword.length < MIN_PASSWORD_LENGTH}
                  onClick={setPasswordNow}
                >
                  Set
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNewPassword(null)}>
                  Cancel
                </button>
              </div>
            </Field>
          ) : (
            <button className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setNewPassword(generatePassword())}>
              Set a new password
            </button>
          )}
        </section>

        <section className="stack">
          <span className="eyebrow">Role & access</span>
          {isAdminUser ? (
            <p className="small muted">Production Manager — full access. You can still choose whether you use shifts or petty cash yourself.</p>
          ) : (
            <Field label="Role">
              <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="grid grid-2">
            <label className={`toggle${perms.shifts ? " on" : ""}`}>
              <input type="checkbox" checked={perms.shifts} onChange={(e) => setPerms({ ...perms, shifts: e.target.checked })} />
              <span>
                <span className="t">Log shifts</span>
                <span className="d" style={{ display: "block" }}>Enter their own working hours (works offline).</span>
              </span>
            </label>
            <label className={`toggle${perms.petty && pettyAllowed ? " on" : ""}${pettyAllowed ? "" : " disabled"}`}>
              <input
                type="checkbox"
                disabled={!pettyAllowed}
                checked={perms.petty && pettyAllowed}
                onChange={(e) => setPerms({ ...perms, petty: e.target.checked })}
              />
              <span>
                <span className="t">Petty cash</span>
                <span className="d" style={{ display: "block" }}>
                  {pettyAllowed ? "Receive money, confirm receipt, upload bills, see their statement." : "The Owner sends petty cash, so can't hold a balance."}
                </span>
              </span>
            </label>
          </div>
        </section>

        <section className="stack">
          <span className="eyebrow">Details (optional)</span>
          <Field label="Contact number">
            <input inputMode="tel" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="050 123 4567" />
          </Field>
          <div className="grid grid-2">
            <Field label="Account holder name">
              <input value={bank.accountHolderName ?? ""} onChange={(e) => setBank({ ...bank, accountHolderName: e.target.value })} />
            </Field>
            <Field label="Bank">
              <input value={bank.bankName ?? ""} onChange={(e) => setBank({ ...bank, bankName: e.target.value })} />
            </Field>
            <Field label="IBAN">
              <input className="num" value={bank.iban ?? ""} onChange={(e) => setBank({ ...bank, iban: e.target.value.toUpperCase() })} placeholder="AE..." />
            </Field>
            <Field label="Account number">
              <input className="num" value={bank.accountNumber ?? ""} onChange={(e) => setBank({ ...bank, accountNumber: e.target.value })} />
            </Field>
          </div>
          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          </Field>
        </section>

        {problems.length ? (
          <ul className="small neg" style={{ margin: 0, paddingLeft: "1.1rem" }}>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </Sheet>
  );
}
