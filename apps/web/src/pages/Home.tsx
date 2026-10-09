import { useMemo } from "react";
import { Link } from "react-router-dom";
import { collection, orderBy, query, where } from "firebase/firestore";
import { db } from "@/firebase";
import { useAuth } from "@/auth/AuthProvider";
import { useSync } from "@/sync/SyncProvider";
import { useLiveQuery } from "@/lib/data";
import {
  reviewableBills,
  useAllBills,
  useAllTransfers,
  useMyBills,
  useMyTransfers,
  usePendingBills,
  useUsers,
} from "@/lib/queries";
import { Banner, Stat } from "@/components/ui";
import { IconPlusClock, IconReceipt, IconSend } from "@/components/icons";
import { ConfirmPayments } from "@/pages/petty/ConfirmPayments";
import { BalanceHero } from "@/pages/petty/MyPetty";
import {
  COL,
  ROLE_LABEL,
  computeStatement,
  dubaiDayRange,
  formatAed,
  formatHours,
  formatIsoDate,
  round2,
  todayDubai,
  type Shift,
} from "@shared";

function monthStart(): string {
  return todayDubai().slice(0, 8) + "01";
}

function weekStart(): string {
  const d = new Date(`${todayDubai()}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function Home() {
  const { profile, role, canShifts, canPetty, isViewer, isOwner } = useAuth();
  const first = profile?.displayName.split(" ")[0] ?? "";

  return (
    <div className="page">
      <div>
        <span className="eyebrow">{formatIsoDate(todayDubai())} · {role ? ROLE_LABEL[role] : ""}</span>
        <h1 style={{ marginTop: 4 }}>Hello, {first}</h1>
      </div>

      {!canShifts && !canPetty && !isViewer ? (
        <Banner tone="info">
          You don't have access to shifts or petty cash yet. Ask the Production Manager to switch on what you need.
        </Banner>
      ) : null}

      {canPetty ? <MyPettySection /> : null}
      {canShifts ? <MyShiftsSection /> : null}
      {isOwner ? <OwnerActions /> : null}
      {isViewer ? <TeamOverview /> : null}
    </div>
  );
}

function MyPettySection() {
  const transfers = useMyTransfers();
  const bills = useMyBills();
  const st = useMemo(() => computeStatement(transfers.data ?? [], bills.data ?? []), [transfers.data, bills.data]);
  return (
    <section className="stack">
      <ConfirmPayments transfers={transfers.data ?? []} />
      <div className="grid grid-main">
        <BalanceHero st={st} />
        <div className="card stack-sm">
          <span className="eyebrow">Petty cash</span>
          <p className="small muted">Spent money from your petty cash? Upload the bill so it comes off your balance.</p>
          <div className="row" style={{ marginTop: 4 }}>
            <Link to="/my-petty/new-bill" className="btn btn-primary">
              <IconReceipt /> Add a bill
            </Link>
            <Link to="/my-petty" className="btn btn-secondary">
              Statement
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function MyShiftsSection() {
  const { user } = useAuth();
  const { pendingCount, rejectedCount } = useSync();
  const [from] = dubaiDayRange(weekStart(), weekStart());
  const shifts = useLiveQuery<Shift>(
    user
      ? query(
          collection(db, COL.shifts),
          where("userUid", "==", user.uid),
          where("deleted", "==", false),
          orderBy("startAt", "desc"),
        )
      : null,
    [user?.uid],
  );
  const week = (shifts.data ?? []).filter((s) => s.startAt >= from);
  const hours = round2(week.reduce((a, s) => a + s.totalHours, 0));
  const wage = round2(week.reduce((a, s) => a + s.wageAmount, 0));

  return (
    <section className="stack">
      {rejectedCount ? (
        <Banner tone="crit">
          {rejectedCount} shift{rejectedCount === 1 ? "" : "s"} couldn't be saved. <Link to="/my-shifts">Check My shifts</Link>.
        </Banner>
      ) : null}
      <div className="grid grid-2 grid-auto">
        <Link to="/log" className="card stack-sm" style={{ textDecoration: "none" }}>
          <span className="icon-dot" style={{ background: "var(--brand)", color: "var(--on-brand)" }}>
            <IconPlusClock />
          </span>
          <h3>Log a shift</h3>
          <span className="small muted">Works without signal — it syncs later.</span>
        </Link>
        <Stat
          label="This week"
          money={false}
          value={`${formatHours(hours)} h`}
          note={`AED ${formatAed(wage)}${pendingCount ? ` · ${pendingCount} waiting to sync` : ""}`}
        />
      </div>
    </section>
  );
}

function OwnerActions() {
  return (
    <Link to="/send" className="card row" style={{ textDecoration: "none" }}>
      <span className="icon-dot" style={{ background: "var(--signal)", color: "#1b1d22" }}>
        <IconSend />
      </span>
      <span className="grow">
        <h3>Send petty cash</h3>
        <span className="small muted">Record a bank transfer or cash handed over.</span>
      </span>
      <span className="btn btn-primary btn-sm">Send</span>
    </Link>
  );
}

function TeamOverview() {
  const { user, isAdmin, isOwner } = useAuth();
  const transfers = useAllTransfers();
  const bills = useAllBills();
  const pending = usePendingBills();
  const users = useUsers();
  const [mStart] = dubaiDayRange(monthStart(), monthStart());
  const shifts = useLiveQuery<Shift>(
    query(collection(db, COL.shifts), where("deleted", "==", false), where("startAt", ">=", mStart), orderBy("startAt", "asc")),
    [mStart],
  );

  const st = computeStatement(transfers.data ?? [], bills.data ?? []);
  const toReview = reviewableBills(pending.data, { uid: user?.uid ?? "", isAdmin, isOwner }, users.data);
  const disputed = (transfers.data ?? []).filter((t) => t.status === "disputed");
  const monthWage = round2((shifts.data ?? []).reduce((a, s) => a + s.wageAmount, 0));
  const monthHours = round2((shifts.data ?? []).reduce((a, s) => a + s.totalHours, 0));

  return (
    <section className="stack">
      <div className="row-between">
        <h2>Team overview</h2>
        <Link to="/reports" className="btn btn-ghost btn-sm">
          Reports →
        </Link>
      </div>
      {toReview.length ? (
        <Banner tone="warn">
          {toReview.length} bill{toReview.length === 1 ? "" : "s"} waiting for your review.{" "}
          <Link to="/petty?tab=bills">Review now</Link>
        </Banner>
      ) : null}
      {disputed.length ? (
        <Banner tone="crit">
          {disputed.length} payment{disputed.length === 1 ? " was" : "s were"} disputed by the recipient.{" "}
          <Link to="/petty?tab=payments">See details</Link>
        </Banner>
      ) : null}
      <div className="grid grid-2 grid-auto">
        <Stat label="Petty cash held by team" value={st.balance} note="Confirmed payments minus approved bills" />
        <Stat label="Awaiting confirmation" value={st.awaitingConfirmation} note="Sent but not yet confirmed" />
        <Stat label="Bills pending review" value={st.pendingBills} />
        <Stat label="Shift wages this month" value={monthWage} note={`${formatHours(monthHours)} hours logged`} />
      </div>
    </section>
  );
}
