"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Site = { id: string; name: string };
type User = { id: string; name: string };

type EventRow = {
  id: string;
  user_id: string;
  user_name: string;
  site_id: string | null;
  site_name: string | null;
  type: "IN" | "OUT" | "OFFSITE";
  day: string;
  time_raw: string;
  time_rounded: string;
  in_time_rounded?: string;
  out_time_rounded?: string;
  hours_rounded?: number;
  pay_hours?: number;
  note_work?: string | null;
  offsite_reason?: string | null;
  is_paid: boolean;
  rate_hourly: number;
  rate_km: number;
  rate_source: "site" | "default";
};

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

function getMe() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user");
  return raw ? JSON.parse(raw) : null;
}

function fmt(n: any) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("cs-CZ", { maximumFractionDigits: 2 });
}

export default function AdminAttendancePage() {
  const router = useRouter();
  const me = useMemo(() => getMe(), []);

  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [siteId, setSiteId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [type, setType] = useState<string>("");
  const [rows, setRows] = useState<EventRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.push("/login");
      return;
    }
    if (!me || me.role !== "admin") {
      router.push("/attendance");
      return;
    }

    fetch("/api/sites")
      .then((r) => r.json())
      .then((d) => setSites(d.sites || []))
      .catch(() => setSites([]));

    fetch("/api/admin/users", { headers: { authorization: `Bearer ${t}` } })
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []))
      .catch(() => setUsers([]));
  }, [router, me]);

  async function load() {
    setErr(null);
    setInfo(null);
    const t = getToken();
    if (!t) return;

    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (siteId) qs.set("site_id", siteId);
    if (userId) qs.set("user_id", userId);
    if (type) qs.set("type", type);
    qs.set("limit", "400");

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/events?${qs.toString()}`, {
        headers: { authorization: `Bearer ${t}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Chyba");
      setRows(data.rows || []);
    } catch (e: any) {
      setErr(e.message || "Chyba");
    } finally {
      setLoading(false);
    }
  }

  async function delEvent(id: string) {
    setErr(null);
    setInfo(null);
    const t = getToken();
    if (!t) return;

    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/attendance/${id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${t}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nešlo smazat.");
      setInfo("Smazáno.");
      setRows((prev) => prev.filter((x) => x.id !== id));
    } catch (e: any) {
      setErr(e.message || "Chyba");
    } finally {
      setBusyId(null);
    }
  }

  async function runRepair() {
    setErr(null);
    setInfo(null);
    const t = getToken();
    if (!t) return;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/repair/in-times?days=14", {
        method: "POST",
        headers: { authorization: `Bearer ${t}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nešlo opravit.");
      setInfo(`Oprava IN hotová: scanned ${data.scanned}, fixed ${data.fixed}.`);
      await load();
    } catch (e: any) {
      setErr(e.message || "Chyba");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="space-y-4 px-3 pb-8">
      <div className="rounded-3xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs text-neutral-500">Admin</div>
            <h1 className="text-lg font-semibold">Docházka – detailní záznamy</h1>
            <div className="mt-2 text-xs text-neutral-600">
              Jednodušší přehled bez bočního scrollování. Každý záznam je v kartě, takže funguje i na telefonu.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="rounded-2xl border bg-white px-4 py-2 text-sm shadow-sm" href="/admin">
              Zpět do adminu
            </Link>
            <button onClick={load} disabled={loading} className="rounded-2xl border bg-white px-4 py-2 text-sm shadow-sm disabled:opacity-50">
              {loading ? "Načítám…" : "Obnovit"}
            </button>
            <button
              onClick={runRepair}
              disabled={loading}
              className="rounded-2xl border bg-amber-50 px-4 py-2 text-sm shadow-sm disabled:opacity-50"
            >
              Opravit posunuté IN
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-5">
          <div>
            <label className="text-xs text-neutral-600">Od</label>
            <input className="mt-1 w-full rounded-2xl border px-3 py-2 text-sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-neutral-600">Do</label>
            <input className="mt-1 w-full rounded-2xl border px-3 py-2 text-sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-neutral-600">Stavba</label>
            <select className="mt-1 w-full rounded-2xl border bg-white px-3 py-2 text-sm" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">Vše</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-neutral-600">Uživatel</label>
            <select className="mt-1 w-full rounded-2xl border bg-white px-3 py-2 text-sm" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Všichni</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-neutral-600">Typ</label>
            <select className="mt-1 w-full rounded-2xl border bg-white px-3 py-2 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Vše</option>
              <option value="IN">IN</option>
              <option value="OUT">OUT</option>
              <option value="OFFSITE">OFFSITE</option>
            </select>
          </div>
        </div>

        {(err || info) && (
          <div className="mt-3 space-y-2">
            {err && <div className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{err}</div>}
            {info && <div className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div>}
          </div>
        )}
      </div>

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="rounded-3xl border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{r.day} • {r.user_name}</div>
                <div className="mt-1 text-xs text-neutral-600">{r.site_name || "—"} • {r.type}</div>
              </div>
              <div className={`rounded-full px-3 py-1 text-xs ${r.is_paid ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                {r.is_paid ? "Zaplaceno" : "Nezaplaceno"}
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div className="rounded-2xl border bg-neutral-50 p-3">
                <div className="text-xs text-neutral-500">Čas</div>
                <div className="mt-1">raw: {r.time_raw || "—"}</div>
                <div>round: {r.time_rounded || "—"}</div>
                <div>IN: {r.in_time_rounded || "—"}</div>
                <div>OUT: {r.out_time_rounded || "—"}</div>
              </div>
              <div className="rounded-2xl border bg-neutral-50 p-3">
                <div className="text-xs text-neutral-500">Výkon</div>
                <div className="mt-1">Hodiny: {r.hours_rounded != null ? fmt(r.hours_rounded) : "—"}</div>
                <div>Sazba: {r.rate_hourly ? fmt(r.rate_hourly) + " Kč" : "—"}</div>
                <div>Částka: {r.pay_hours != null ? fmt(r.pay_hours) + " Kč" : "—"}</div>
              </div>
              <div className="rounded-2xl border bg-neutral-50 p-3 sm:col-span-2">
                <div className="text-xs text-neutral-500">Poznámka</div>
                <div className="mt-1 break-words">{r.type === "OUT" ? r.note_work || "—" : r.type === "OFFSITE" ? r.offsite_reason || "—" : "—"}</div>
              </div>
            </div>

            <div className="mt-3 flex justify-end">
              <button
                className="rounded-xl border px-3 py-2 text-sm hover:bg-red-50 disabled:opacity-50"
                onClick={() => delEvent(r.id)}
                disabled={busyId === r.id}
              >
                {busyId === r.id ? "Mažu…" : "Smazat tento záznam"}
              </button>
            </div>
          </div>
        ))}

        {rows.length === 0 && (
          <div className="rounded-3xl border bg-white p-6 text-center text-sm text-neutral-500 shadow-sm">
            Žádné záznamy.
          </div>
        )}
      </div>
    </main>
  );
}
