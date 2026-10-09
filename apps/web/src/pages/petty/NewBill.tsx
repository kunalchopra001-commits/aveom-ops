import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { api, errMessage } from "@/lib/api";
import { newId, safeFileName, uploadFile } from "@/lib/data";
import { useProjects } from "@/lib/queries";
import { Banner, Field, PageHead, Spinner, useOnline } from "@/components/ui";
import { IconUpload, IconX } from "@/components/icons";
import { MAX_BILL_FILES, MAX_UPLOAD_BYTES, parseAmount, todayDubai, type BillScan } from "@shared";

interface Picked {
  file: File;
  preview?: string;
  path?: string; // set once uploaded
}

type Filled = Partial<Record<"amount" | "spentOn" | "vendor" | "description", boolean>>;

export function NewBill() {
  const { user } = useAuth();
  const nav = useNavigate();
  const online = useOnline();
  const projects = useProjects(true);
  const input = useRef<HTMLInputElement>(null);
  const billId = useRef(newId());

  const [amount, setAmount] = useState("");
  const [spentOn, setSpentOn] = useState(todayDubai());
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [projectId, setProjectId] = useState("");
  const [files, setFiles] = useState<Picked[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [scan, setScan] = useState<BillScan | null>(null);
  const [scanNote, setScanNote] = useState("");
  const [filled, setFilled] = useState<Filled>({});
  const touched = useRef<Filled>({});

  const latest = useRef(files);
  latest.current = files;
  useEffect(() => () => latest.current.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)), []);

  async function pick(list: FileList | null) {
    if (!user) return;
    setError("");
    const added: Picked[] = [];
    for (const file of Array.from(list ?? [])) {
      if (!/^image\/|^application\/pdf$/.test(file.type)) {
        setError(`“${file.name}” isn't a photo or PDF.`);
        continue;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setError(`“${file.name}” is bigger than 10 MB.`);
        continue;
      }
      if (files.length + added.length >= MAX_BILL_FILES) {
        setError(`You can attach up to ${MAX_BILL_FILES} files.`);
        break;
      }
      added.push({ file, preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined });
    }
    if (input.current) input.current.value = "";
    if (!added.length) return;

    // Upload straight away so the AI can read the bill while the person waits.
    try {
      for (let i = 0; i < added.length; i++) {
        setBusy(`Uploading ${i + 1} of ${added.length}…`);
        const f = added[i].file;
        added[i].path = await uploadFile(`bills/${user.uid}/${billId.current}/${Date.now()}-${safeFileName(f.name)}`, f);
      }
    } catch (e) {
      setError(errMessage(e));
      setBusy("");
      return;
    }
    const all = [...files, ...added];
    setFiles(all);
    await runScan(all);
  }

  async function runScan(list: Picked[]) {
    const paths = list.map((f) => f.path).filter((p): p is string => !!p);
    if (!paths.length) return;
    setBusy("Reading your bill…");
    setScanNote("");
    try {
      const s = await api.scanBill({ billId: billId.current, paths });
      setScan(s);
      const f: Filled = {};
      // Fill only what the person hasn't typed themselves.
      if (s.amount != null && !touched.current.amount) {
        setAmount(s.amount.toFixed(2));
        f.amount = true;
      }
      if (s.spentOn && !touched.current.spentOn) {
        setSpentOn(s.spentOn);
        f.spentOn = true;
      }
      if (s.vendor && !touched.current.vendor) {
        setVendor(s.vendor);
        f.vendor = true;
      }
      if (s.description && !touched.current.description) {
        setDescription(s.description);
        f.description = true;
      }
      setFilled(f);
      const missing = [s.amount == null && "amount", !s.spentOn && "date", !s.description && "description"].filter(Boolean);
      setScanNote(
        Object.keys(f).length === 0
          ? "Couldn't read this bill clearly — please fill in the details."
          : missing.length
            ? `Filled in what we could read. Please add the ${missing.join(" and ")}.`
            : "Details filled in from your bill — check them, then submit.",
      );
    } catch (e) {
      setScanNote(errMessage(e));
    } finally {
      setBusy("");
    }
  }

  function edit<K extends keyof Filled>(key: K, set: (v: string) => void) {
    return (v: string) => {
      touched.current[key] = true;
      setFilled((f) => ({ ...f, [key]: false }));
      set(v);
    };
  }

  const parsed = parseAmount(amount);
  const uploaded = files.filter((f) => f.path);
  const foreign = scan?.currency && scan.currency !== "AED" ? scan.currency : null;
  const ready = !!parsed && description.trim().length >= 3 && uploaded.length > 0 && !!spentOn;

  async function submit() {
    if (!parsed) return;
    setError("");
    setBusy("Submitting…");
    try {
      await api.submitBill({
        id: billId.current,
        amount: parsed,
        spentOn,
        description: description.trim(),
        vendor: vendor.trim() || undefined,
        projectId: projectId || undefined,
        files: uploaded.map((f) => f.path!),
      });
      nav("/my-petty", { replace: true });
    } catch (e) {
      setError(errMessage(e));
      setBusy("");
    }
  }

  const ai = (k: keyof Filled) => (filled[k] ? "✓ Read from your bill — check it" : undefined);

  return (
    <div className="page" style={{ maxWidth: 620 }}>
      <PageHead title="Add a bill" sub="Take a photo of the receipt — we'll read it and fill in the details for you." />
      {!online ? <Banner tone="warn">You're offline. You'll need signal to upload a bill.</Banner> : null}
      {error ? <Banner tone="crit">{error}</Banner> : null}

      <div className="card stack">
        <div className="field">
          <span>1. Photo or PDF of the bill</span>
          <button type="button" className="dropzone" disabled={!!busy || !online} onClick={() => input.current?.click()}>
            <IconUpload />
            <b>{files.length ? "Add another page" : "Take a photo or choose a file"}</b>
            <span className="tiny">Photos or PDF · up to {MAX_BILL_FILES} files · 10 MB each</span>
          </button>
          <input ref={input} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => pick(e.target.files)} />
          {files.length ? (
            <div className="stack-sm" style={{ marginTop: 6 }}>
              {files.map((f, i) => (
                <div className="file-chip" key={f.path ?? i}>
                  {f.preview ? <img src={f.preview} alt="" /> : <span className="pdf">PDF</span>}
                  <span className="grow truncate">{f.file.name}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label={`Remove ${f.file.name}`}
                    disabled={!!busy}
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  >
                    <IconX />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {busy === "Reading your bill…" ? (
          <div className="card-flat row">
            <Spinner small /> <span className="small">Reading your bill…</span>
          </div>
        ) : scanNote ? (
          <div className="row-between">
            <span className="small muted grow">{scanNote}</span>
            {uploaded.length ? (
              <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => runScan(uploaded)}>
                Read again
              </button>
            ) : null}
          </div>
        ) : null}
        {foreign ? (
          <Banner tone="warn">
            This bill looks like it's in {foreign}. Enter the amount you actually paid in AED.
          </Banner>
        ) : null}
      </div>

      <div className="card stack">
        <span className="eyebrow">2. Check the details</span>
        <Field label="Amount (AED)" hint={ai("amount")}>
          <div className="input-money">
            <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => edit("amount", setAmount)(e.target.value)} />
          </div>
        </Field>
        <Field label="What was it for?" hint={ai("description")}>
          <input
            value={description}
            onChange={(e) => edit("description", setDescription)(e.target.value)}
            placeholder="e.g. Cable ties and tape for setup"
            maxLength={200}
          />
        </Field>
        <div className="grid grid-2">
          <div>
            <Field label="Bill date" hint={ai("spentOn")}>
              <input type="date" value={spentOn} max={todayDubai()} onChange={(e) => edit("spentOn", setSpentOn)(e.target.value)} />
            </Field>
          </div>
          <div>
            <Field label="Shop / supplier" hint={ai("vendor")}>
              <input value={vendor} onChange={(e) => edit("vendor", setVendor)(e.target.value)} maxLength={100} />
            </Field>
          </div>
        </div>
        {projects.data && projects.data.length ? (
          <Field label="Project (optional)">
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">— None —</option>
              {[...projects.data]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </Field>
        ) : null}
      </div>

      <div className="row">
        <Link to="/my-petty" className="btn btn-ghost">
          Cancel
        </Link>
        <button className="btn btn-primary btn-lg grow" disabled={!ready || !!busy || !online} onClick={submit}>
          {busy && busy !== "Reading your bill…" ? (
            <>
              <Spinner small /> {busy}
            </>
          ) : (
            "Submit bill"
          )}
        </button>
      </div>
      <p className="small faint">The Production Manager reviews every bill. You'll see it as “Pending review” until then.</p>
    </div>
  );
}
