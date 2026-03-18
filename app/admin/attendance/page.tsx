"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtTimeCZFromIso } from "@/lib/time";

type Site = { id: string; name: string };
type User = { id: string; name: string };
type Row = {
  id: string;
  sourceKind: "WORK" | "PROGRAM" | "OFFSITE";
  sourceId: string | null;
  sourceIds?: string[];
  user_id: string;
  user_name: string;
  site_id: string | null;
  site_name: string | null;
  day: string;
  paid: boolean;
  title: string;
  first_in: string | null;
  last_out: string | null;
  hours: number;
  hourly_rate: number;
  pay: number;
  km: number;
  km_pay: number;
  material: number;
  total: number;
  note: string;
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
function fmtTime(iso: string | null) {
  return fmtTimeCZFromIso(iso);
}

export default function AdminAttendancePage() {
  const router = useRouter();
  const me = useMemo(() => getMe(), []);
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [siteId, setSiteId] = useState("");
  const [userId, setUserId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const t = getToken();
    if (!t) { router.push("/login"); return; }
    if (!me || me.role !== "admin") { router.push("/attendance"); return; }
    fetch("/api/sites").then(r => r.json()).then(d => setSites(d.sites || [])).catch(() => setSites([]));
    fetch("/api/admin/users", { headers: { authorization: `Bearer ${t}` } }).then(r => r.json()).then(d => setUsers(d.users || [])).catch(() => setUsers([]));
  }, [router, me]);

  async function load() {
    setErr(null); setInfo(null);
    const t = getToken(); if (!t) return;
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (siteId) qs.set("site_id", siteId);
    if (userId) qs.set("user_id", userId);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/attendance-summary?${qs.toString()}`, { headers: { authorization: `Bearer ${t}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Chyba");
      setRows(data.rows || []);
    } catch (e:any) { setErr(e.message || "Chyba"); } finally { setLoading(false); }
  }

  async function delRow(r: Row) {
    const t = getToken(); if (!t || !r.sourceId) return;
    setErr(null); setInfo(null); setBusyId(r.id);
    try {
      if (r.sourceKind === "PROGRAM") {
        const res = await fetch(`/api/admin/events/${r.sourceId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
          body: JSON.stringify({ programming_hours: 0, programming_note: "" }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Nešlo smazat programování.");
      } else {
        const res = await fetch(`/api/admin/attendance/${r.sourceId}`, {
          method: "DELETE",
          headers: { authorization: `Bearer ${t}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Nešlo smazat záznam.");
      }
      setInfo("Smazáno.");
      await load();
    } catch (e:any) {
      setErr(e.message || "Chyba");
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <main className="space-y-4 px-3 pb-8">
      <div className="rounded-3xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs text-neutral-500">Admin</div>
            <h1 className="text-lg font-semibold">Docházka – přehled po dnech</h1>
            <div className="mt-2 text-xs text-neutral-600">Práce je sloučená do jedné karty za den/stavbu. Programování je samostatná karta.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="rounded-2xl border bg-white px-4 py-2 text-sm shadow-sm" href="/admin">Zpět do adminu</Link>
            <button onClick={load} disabled={loading} className="rounded-2xl border bg-white px-4 py-2 text-sm shadow-sm disabled:opacity-50">{loading ? "Načítám…" : "Obnovit"}</button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-4">
          <div><label className="text-xs text-neutral-600">Od</label><input className="mt-1 w-full rounded-2xl border px-3 py-2 text-sm" type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><label className="text-xs text-neutral-600">Do</label><input className="mt-1 w-full rounded-2xl border px-3 py-2 text-sm" type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
          <div><label className="text-xs text-neutral-600">Stavba</label><select className="mt-1 w-full rounded-2xl border bg-white px-3 py-2 text-sm" value={siteId} onChange={e => setSiteId(e.target.value)}><option value="">Vše</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><label className="text-xs text-neutral-600">Uživatel</label><select className="mt-1 w-full rounded-2xl border bg-white px-3 py-2 text-sm" value={userId} onChange={e => setUserId(e.target.value)}><option value="">Všichni</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
        </div>
        <div className="mt-3"><button onClick={load} className="rounded-2xl bg-black px-4 py-2 text-sm text-white">Filtrovat</button></div>
        {(err || info) && <div className="mt-3 space-y-2">{err && <div className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{err}</div>}{info && <div className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div>}</div>}
      </div>

      <div className="space-y-3">
        {rows.map(r => (
          <div key={r.id} className="rounded-3xl border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{r.day} • {r.user_name}</div>
                <div className="mt-1 text-xs text-neutral-600">{r.site_name || "—"} • {r.title}</div>
              </div>
              <div className={`rounded-full px-3 py-1 text-xs ${r.paid ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{r.paid ? "Zaplaceno" : "Nezaplaceno"}</div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div className="rounded-2xl border bg-neutral-50 p-3">
                <div className="text-xs text-neutral-500">Čas</div>
                <div className="mt-1">Začátek: {fmtTime(r.first_in)}</div>
                <div>Konec: {fmtTime(r.last_out)}</div>
                <div>Hodiny: {fmt(r.hours)}</div>
              </div>
              <div className="rounded-2xl border bg-neutral-50 p-3">
                <div className="text-xs text-neutral-500">Peníze</div>
                <div className="mt-1">Sazba: {fmt(r.hourly_rate)} Kč</div>
                <div>Práce: {fmt(r.pay)} Kč</div>
                <div>Celkem: {fmt(r.total)} Kč</div>
              </div>
              <div className="rounded-2xl border bg-neutral-50 p-3">
                <div className="text-xs text-neutral-500">Doprava / materiál</div>
                <div className="mt-1">Km: {fmt(r.km)}</div>
                <div>Doprava: {fmt(r.km_pay)} Kč</div>
                <div>Materiál: {fmt(r.material)} Kč</div>
              </div>
              <div className="rounded-2xl border bg-neutral-50 p-3">
                <div className="text-xs text-neutral-500">Poznámka</div>
                <div className="mt-1 break-words">{r.note || "—"}</div>
              </div>
            </div>

            <div className="mt-3 flex justify-end">
              <button className="rounded-xl border px-3 py-2 text-sm hover:bg-red-50 disabled:opacity-50" onClick={() => delRow(r)} disabled={busyId === r.id || r.paid}>
                {busyId === r.id ? "Mažu…" : (r.sourceKind === "PROGRAM" ? "Smazat programování" : "Smazat tento záznam")}
              </button>
            </div>
          </div>
        ))}

        {rows.length === 0 && <div className="rounded-3xl border bg-white p-6 text-center text-sm text-neutral-500 shadow-sm">Žádné záznamy.</div>}
      </div>
    </main>
  );
}
