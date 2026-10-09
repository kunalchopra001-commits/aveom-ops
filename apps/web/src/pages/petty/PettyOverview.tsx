import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { reviewableBills, useAllBills, useAllTransfers, useUsers } from "@/lib/queries";
import { openStoredFile } from "@/lib/data";
import { Empty, Loading, Money, PageHead, Segmented, StatusChip, Tabs } from "@/components/ui";
import { IconReceipt, IconWallet } from "@/components/icons";
import { BillSheet } from "@/pages/petty/BillSheet";
import {
  METHOD_LABEL,
  computeStatement,
  formatAed,
  formatDubaiDateTime,
  formatIsoDate,
  type Bill,
  type Transfer,
  type UserProfile,
} from "@shared";

type Tab = "balances" | "payments" | "bills";

export function PettyOverview() {
  const { user, isAdmin, isOwner } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "balances";
  const setTab = (t: Tab) => setParams({ tab: t }, { replace: true });

  const transfers = useAllTransfers();
  const bills = useAllBills();
  const users = useUsers();
  const toReview = reviewableBills(bills.data, { uid: user?.uid ?? "", isAdmin, isOwner }, users.data);
  const loading = transfers.data === null || bills.data === null || users.data === null;

  return (
    <div className="page">
      <PageHead
        title="Petty cash"
        sub={isAdmin ? "Balances, payments and bills for everyone. You approve bills." : "Balances, payments and bills for everyone."}
      />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { value: "balances", label: "Balances" },
          { value: "payments", label: "Payments" },
          { value: "bills", label: "Bills", count: toReview.length },
        ]}
      />
      {loading ? (
        <Loading />
      ) : tab === "balances" ? (
        <Balances transfers={transfers.data!} bills={bills.data!} users={users.data!} />
      ) : tab === "payments" ? (
        <Payments transfers={transfers.data!} />
      ) : (
        <Bills bills={bills.data!} reviewable={new Set(toReview.map((b) => b.id))} />
      )}
    </div>
  );
}

function Balances({ transfers, bills, users }: { transfers: Transfer[]; bills: Bill[]; users: UserProfile[] }) {
  const rows = useMemo(() => {
    const uids = new Set([...transfers.map((t) => t.toUid), ...bills.map((b) => b.uid)]);
    users.filter((u) => u.perms.petty).forEach((u) => uids.add(u.uid));
    return [...uids]
      .map((uid) => {
        const u = users.find((x) => x.uid === uid);
        const st = computeStatement(
          transfers.filter((t) => t.toUid === uid),
          bills.filter((b) => b.uid === uid),
        );
        return { uid, name: u?.displayName ?? transfers.find((t) => t.toUid === uid)?.toName ?? uid, active: u?.active ?? false, st };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [transfers, bills, users]);

  if (rows.length === 0) return <Empty icon={<IconWallet />} title="No petty cash holders yet" />;
  const total = rows.reduce(
    (a, r) => ({
      received: a.received + r.st.received,
      approved: a.approved + r.st.approvedBills,
      balance: a.balance + r.st.balance,
      awaiting: a.awaiting + r.st.awaitingConfirmation,
      pending: a.pending + r.st.pendingBills,
    }),
    { received: 0, approved: 0, balance: 0, awaiting: 0, pending: 0 },
  );

  return (
    <div className="card card-tight table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Person</th>
            <th className="num">Received</th>
            <th className="num">Bills approved</th>
            <th className="num">Balance</th>
            <th className="num">Awaiting confirm.</th>
            <th className="num">Bills pending</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.uid} className={r.active ? "" : "is-muted"}>
              <td>
                {r.name}
                {r.st.disputed ? <span className="chip neg" style={{ marginLeft: 6 }}>dispute</span> : null}
              </td>
              <td className="num">{formatAed(r.st.received)}</td>
              <td className="num">{formatAed(r.st.approvedBills)}</td>
              <td className="num" style={{ fontWeight: 650 }}>{formatAed(r.st.balance)}</td>
              <td className="num">{r.st.awaitingConfirmation ? formatAed(r.st.awaitingConfirmation) : "—"}</td>
              <td className="num">{r.st.pendingBills ? formatAed(r.st.pendingBills) : "—"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td className="num">{formatAed(total.received)}</td>
            <td className="num">{formatAed(total.approved)}</td>
            <td className="num">{formatAed(total.balance)}</td>
            <td className="num">{formatAed(total.awaiting)}</td>
            <td className="num">{formatAed(total.pending)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Payments({ transfers }: { transfers: Transfer[] }) {
  if (transfers.length === 0) return <Empty icon={<IconWallet />} title="No payments yet" />;
  return (
    <div className="card card-tight table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Paid on</th>
            <th>To</th>
            <th>Method</th>
            <th className="num">Amount</th>
            <th>Status</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {transfers.map((t) => (
            <tr key={t.id} className={t.status === "cancelled" ? "is-muted" : ""}>
              <td className="nowrap">{formatIsoDate(t.paidOn)}</td>
              <td>{t.toName}</td>
              <td>{METHOD_LABEL[t.method]}</td>
              <td className="num">
                <Money value={t.amount} />
              </td>
              <td>
                <StatusChip status={t.status} />
                {t.respondedAt ? <div className="tiny faint">{formatDubaiDateTime(t.respondedAt)}</div> : null}
              </td>
              <td className="small" style={{ maxWidth: 280 }}>
                {[t.reference, t.note].filter(Boolean).join(" · ")}
                {t.responseNote ? <div className="neg">Recipient: “{t.responseNote}”</div> : null}
                {t.cancelReason ? <div className="faint">Cancelled: {t.cancelReason}</div> : null}
                {t.proofPath ? (
                  <button className="btn btn-ghost btn-sm" style={{ minHeight: 26, padding: "0 6px" }} onClick={() => openStoredFile(t.proofPath!)}>
                    Proof ↗
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type BillFilter = "pending" | "all";

function Bills({ bills, reviewable }: { bills: Bill[]; reviewable: Set<string> }) {
  const [filter, setFilter] = useState<BillFilter>(bills.some((b) => b.status === "pending") ? "pending" : "all");
  const [open, setOpen] = useState<Bill | null>(null);
  const shown = filter === "pending" ? bills.filter((b) => b.status === "pending") : bills;

  return (
    <div className="stack">
      <Segmented<BillFilter>
        value={filter}
        onChange={setFilter}
        items={[
          { value: "pending", label: "Pending review" },
          { value: "all", label: "All bills" },
        ]}
      />
      <div className="card card-tight">
        {shown.length === 0 ? (
          <Empty icon={<IconReceipt />} title={filter === "pending" ? "Nothing waiting for review" : "No bills yet"} />
        ) : (
          <div className="list">
            {shown.map((b) => (
              <button key={b.id} className="list-item" onClick={() => setOpen(b)}>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="title truncate" style={{ display: "block" }}>
                    {b.userName} · {b.description}
                  </span>
                  <span className="sub">
                    {formatIsoDate(b.spentOn)} · {b.files.length} file{b.files.length === 1 ? "" : "s"}
                    {b.projectName ? ` · ${b.projectName}` : ""}
                  </span>
                </span>
                <span className="stack-sm" style={{ alignItems: "flex-end", gap: 4 }}>
                  <Money value={b.amount} />
                  {reviewable.has(b.id) ? <span className="chip dark">Review</span> : <StatusChip status={b.status} />}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {open ? <BillSheet bill={open} canReview={reviewable.has(open.id)} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
