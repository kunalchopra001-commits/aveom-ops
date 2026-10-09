import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMyBills, useMyTransfers } from "@/lib/queries";
import { Empty, Loading, Money, PageHead, Segmented, StatusChip } from "@/components/ui";
import { IconArrowIn, IconArrowOut, IconReceipt, IconWallet } from "@/components/icons";
import { ConfirmPayments } from "@/pages/petty/ConfirmPayments";
import { BillSheet } from "@/pages/petty/BillSheet";
import { computeStatement, formatAed, formatIsoDate, type Bill, type Statement } from "@shared";

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

  const st = useMemo(() => computeStatement(transfers.data ?? [], bills.data ?? []), [transfers.data, bills.data]);
  const lines = [...st.lines]
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

      <div className="card card-tight">
        <div className="row-between" style={{ padding: "0.9rem 1rem" }}>
          <h2>Statement</h2>
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
          <Empty icon={<IconWallet />} title="Nothing here yet">
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
      </div>
      <p className="small faint">
        Only payments you've confirmed and bills the Production Manager has approved change your balance.
      </p>
      {openBill ? <BillSheet bill={openBill} onClose={() => setOpenBill(null)} /> : null}
    </div>
  );
}
