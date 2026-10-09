import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMyBills, useMyTransfers } from "@/lib/queries";
import { Empty, Loading, Money, PageHead, Segmented, StatusChip } from "@/components/ui";
import { IconArrowIn, IconArrowOut, IconReceipt, IconWallet } from "@/components/icons";
import { ConfirmPayments } from "@/pages/petty/ConfirmPayments";
import { BillSheet } from "@/pages/petty/BillSheet";
import { RangePicker } from "@/components/RangePicker";
import {
  computeStatement,
  formatAed,
  formatIsoDate,
  formatRange,
  fortnightOf,
  type Bill,
  type DateRange,
  type Statement,
} from "@shared";

export function BalanceHero({ st }: { st: Statement }) {
  return (
    <div className="balance-hero">
      <span className="eyebrow">Your petty cash balance</span>
      <div className="big">
        <small>AED</small>
        {formatAed(st.balance)}
      </div>
      <div className="meta">
        <div>
          <span>Received </span>
          <b className="num">{formatAed(st.received)}</b>
        </div>
        <div>
          <span>Bills approved </span>
          <b className="num">{formatAed(st.approvedBills)}</b>
        </div>
        {st.pendingBills ? (
          <div>
            <span>Bills pending </span>
            <b className="num">{formatAed(st.pendingBills)}</b>
          </div>
        ) : null}
      </div>
    </div>
  );
}

type Filter = "all" | "in" | "out";

export function MyPetty() {
  const transfers = useMyTransfers();
  const bills = useMyBills();
  const [filter, setFilter] = useState<Filter>("all");
  const [openBill, setOpenBill] = useState<Bill | null>(null);
  const [range, setRange] = useState<DateRange>(() => fortnightOf());

  // The balance is all-time; the statement shows the chosen period, starting from the
  // balance carried in from before it so the running balance still adds up.
  const st = useMemo(() => computeStatement(transfers.data ?? [], bills.data ?? []), [transfers.data, bills.data]);
  const before = st.lines.filter((l) => l.date < range[0] && l.counts);
  const opening = before.length ? before[before.length - 1].balance : 0;
  const inRange = st.lines.filter((l) => l.date >= range[0] && l.date <= range[1]);
  const periodIn = inRange.filter((l) => l.counts).reduce((a, l) => a + l.moneyIn, 0);
  const periodOut = inRange.filter((l) => l.counts).reduce((a, l) => a + l.moneyOut, 0);
  const lines = [...inRange]
    .reverse()
    .filter((l) => filter === "all" || (filter === "in" ? l.kind === "received" : l.kind === "bill"));
  const loading = transfers.data === null || bills.data === null;

  return (
    <div className="page">
      <PageHead
        title="My petty cash"
        sub="Money you've received and the bills you've spent it on."
        actions={
          <Link to="/my-petty/new-bill" className="btn btn-primary">
            <IconReceipt /> Add a bill
          </Link>
        }
      />
      <ConfirmPayments transfers={transfers.data ?? []} />
      <BalanceHero st={st} />

      <RangePicker value={range} onChange={setRange} />
      <div className="card card-tight">
        <div className="row-between" style={{ padding: "0.9rem 1rem" }}>
          <div>
            <h2>Statement</h2>
            <span className="small faint num">
              In {formatAed(periodIn)} · Out {formatAed(periodOut)}
            </span>
          </div>
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            items={[
              { value: "all", label: "All" },
              { value: "in", label: "Received" },
              { value: "out", label: "Bills" },
            ]}
          />
        </div>
        <hr className="divider" />
        {loading ? (
          <Loading />
        ) : lines.length === 0 ? (
          <Empty icon={<IconWallet />} title={`Nothing in ${formatRange(range)}`}>
            Payments from Inaye and the bills you add will appear here.
          </Empty>
        ) : (
          <div className="list">
            {lines.map((l) => {
              const bill = l.kind === "bill" ? bills.data?.find((b) => b.id === l.id) : undefined;
              const Row = bill ? "button" : "div";
              return (
                <Row key={l.id} className="list-item" onClick={bill ? () => setOpenBill(bill) : undefined}>
                  <span className={`icon-dot ${!l.counts ? "wait" : l.kind === "received" ? "in" : "out"}`}>
                    {l.kind === "received" ? <IconArrowIn /> : <IconArrowOut />}
                  </span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="title truncate" style={{ display: "block" }}>
                      {l.description}
                    </span>
                    <span className="sub row" style={{ gap: "0.4rem" }}>
                      {formatIsoDate(l.date)}
                      {l.receiptDate && l.receiptDate !== l.date ? ` · receipt ${formatIsoDate(l.receiptDate)}` : ""}
                      {l.status !== "acknowledged" && l.status !== "approved" ? <StatusChip status={l.status} /> : null}
                    </span>
                  </span>
                  <span className="stack-sm" style={{ alignItems: "flex-end", gap: 2 }}>
                    <span style={{ opacity: l.counts ? 1 : 0.55, textDecoration: l.status === "rejected" ? "line-through" : undefined }}>
                      <Money value={l.moneyIn || l.moneyOut} sign={l.kind === "received" ? "in" : "out"} />
                    </span>
                    {l.counts ? <span className="tiny faint num">bal {formatAed(l.balance)}</span> : null}
                  </span>
                </Row>
              );
            })}
          </div>
        )}
        {!loading ? (
          <div className="row-between small" style={{ padding: "0.7rem 1rem", borderTop: "1px solid var(--line)", background: "var(--surface-2)" }}>
            <span className="muted">Opening balance on {formatIsoDate(range[0])}</span>
            <b className="num">AED {formatAed(opening)}</b>
          </div>
        ) : null}
      </div>
      <p className="small faint">
        Only payments you've confirmed and bills the Production Manager has approved change your balance.
      </p>
      {openBill ? <BillSheet bill={openBill} onClose={() => setOpenBill(null)} /> : null}
    </div>
  );
}
