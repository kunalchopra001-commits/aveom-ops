import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { api, errMessage } from "@/lib/api";
import { newId, safeFileName, uploadFile } from "@/lib/data";
import { useProjects } from "@/lib/queries";
import { Banner, Field, PageHead, Spinner, useOnline } from "@/components/ui";
import { IconUpload, IconX } from "@/components/icons";
import { MAX_BILL_FILES, MAX_UPLOAD_BYTES, parseAmount, todayDubai } from "@shared";

interface Picked {
  file: File;
  preview?: string;
}

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

  const latest = useRef(files);
  latest.current = files;
  useEffect(() => () => latest.current.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)), []);

  function pick(list: FileList | null) {
    setError("");
    const next = [...files];
    for (const file of Array.from(list ?? [])) {
      if (!/^image\/|^application\/pdf$/.test(file.type)) {
        setError(`“${file.name}” isn't a photo or PDF.`);
        continue;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setError(`“${file.name}” is bigger than 10 MB.`);
        continue;
      }
      if (next.length >= MAX_BILL_FILES) {
        setError(`You can attach up to ${MAX_BILL_FILES} files.`);
        break;
      }
      next.push({ file, preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined });
    }
    setFiles(next);
    if (input.current) input.current.value = "";
  }

  const parsed = parseAmount(amount);
  const ready = !!parsed && description.trim().length >= 3 && files.length > 0 && !!spentOn;

  async function submit() {
    if (!user || !parsed) return;
    setError("");
    try {
      const id = billId.current;
      const paths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        setBusy(`Uploading ${i + 1} of ${files.length}…`);
        const f = files[i].file;
        paths.push(await uploadFile(`bills/${user.uid}/${id}/${i + 1}-${safeFileName(f.name)}`, f));
      }
      setBusy("Submitting…");
      await api.submitBill({
        id,
        amount: parsed,
        spentOn,
        description: description.trim(),
        vendor: vendor.trim() || undefined,
        projectId: projectId || undefined,
        files: paths,
      });
      nav("/my-petty", { replace: true });
    } catch (e) {
      setError(errMessage(e));
      setBusy("");
      billId.current = newId(); // uploaded files can't be overwritten; retry under a fresh id
    }
  }

  return (
    <div className="page" style={{ maxWidth: 620 }}>
      <PageHead title="Add a bill" sub="Spent petty cash? Add the receipt so it comes off your balance." />
      {!online ? <Banner tone="warn">You're offline. You'll need signal to upload a bill.</Banner> : null}
      {error ? <Banner tone="crit">{error}</Banner> : null}

      <div className="card stack">
        <Field label="Amount">
          <div className="input-money">
            <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </Field>
        <Field label="What was it for?">
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Cable ties and tape for setup" maxLength={200} />
        </Field>
        <div className="grid grid-2">
          <Field label="Bill date">
            <input type="date" value={spentOn} max={todayDubai()} onChange={(e) => setSpentOn(e.target.value)} />
          </Field>
          <Field label="Shop / supplier (optional)">
            <input value={vendor} onChange={(e) => setVendor(e.target.value)} maxLength={100} />
          </Field>
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

        <div className="field">
          <span>Photo or PDF of the bill</span>
          <button type="button" className="dropzone" onClick={() => input.current?.click()}>
            <IconUpload />
            <b>Take a photo or choose a file</b>
            <span className="tiny">Photos or PDF · up to {MAX_BILL_FILES} files · 10 MB each</span>
          </button>
          <input
            ref={input}
            type="file"
            accept="image/*,application/pdf"
            multiple
            hidden
            onChange={(e) => pick(e.target.files)}
          />
          {files.length ? (
            <div className="stack-sm" style={{ marginTop: 6 }}>
              {files.map((f, i) => (
                <div className="file-chip" key={i}>
                  {f.preview ? <img src={f.preview} alt="" /> : <span className="pdf">PDF</span>}
                  <span className="grow truncate">{f.file.name}</span>
                  <span className="tiny faint">{Math.ceil(f.file.size / 1024)} KB</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label={`Remove ${f.file.name}`}
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  >
                    <IconX />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="row">
        <Link to="/my-petty" className="btn btn-ghost">
          Cancel
        </Link>
        <button className="btn btn-primary btn-lg grow" disabled={!ready || !!busy || !online} onClick={submit}>
          {busy ? (
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
