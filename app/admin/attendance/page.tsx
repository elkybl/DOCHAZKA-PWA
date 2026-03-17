"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtDateTimeCZFromIso, fmtTimeCZFromIso } from "@/lib/time";

type Site = { id: string; name: string };
type User = { id: string; name: string };
type WorkSeg = {
  kind: "WORK";
  source_event_id: string;
  site_id: string | null;
  site_name: string | null;
  in_time: string;
  out_time: string;
  hours: number;
  hourly_rate: number;
  rate_source: "site" | "default";
  pay: number;
  note_work: string | null;
  km: number;
  km_pay: number;
  material_amount: number;
  material_desc: string | null;
  total: number;
  is_paid: boolean;
};
type ProgramSeg = {
  kind: "PROGRAM";
  source_event_id: string;
  site_id: string | null;
  site_name: string | null;
  day: string;
  hours: number;
  hourly_rate: number;
  rate_source: "site" | "default";
  pay: number;
  note: string | null;
  is_paid: boolean;
};
type OffSeg = {
  kind: "OFFSITE";
  source_event_id: string;
  site_id: string | null;
  site_name: string | null;
  reason: string;
  hours: number;
  hourly_rate: number;
  rate_source: "site" | "default";
  pay: number;
  is_paid: boolean;
};
type DayRow = {
  user_id: string;
  user_name: string;
  day: string;
  first_in: string | null;
  last_out: string | null;
  sites: string[];
  segments: WorkSeg[];
  programming: ProgramSeg[];
  offsites: OffSeg[];
  hours: number;
  km: number;
  material: number;
  hours_pay: number;
  km_pay: number;
  total: number;
  paid: boolean;
};

type FlatRow = {
  key: string;
  day: string;
  user_name: string;
  site_name: string | null;
  kind: "WORK" | "PROGRAM" | "OFFSITE";
  time: string;
  hours: number;
  rate: number;
  pay: number;
  km?: number;
  km_pay?: number;
  material?: number;
  total: number;
  note: string;
  source_event_id: string;
  is_paid: boolean;
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
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [siteId, setSiteId] = useState("");
  const [userId, setUserId] = useState("");
  const [rows, setRows] = useState<DayRow[]>([]);
  const [flatRows, setFlatRows] = useState<FlatRow[]>([]);
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

  function flatten(dayRows: DayRow[]) {
    const out: FlatRow[] = [];
    for (const d of dayRows) {
      for (const s of d.segments || []) {
        out.push({
          key: `W_${s.source_event_id}`,
          day: d.day,
          user_name: d.user_name,
          site_name: s.site_name,
          kind: "WORK",
          time: `${fmtTimeCZFromIso(s.in_time)}–${fmtTimeCZFromIso(s.out_time)}`,
          hours: s.hours,
          rate: s.hourly_rate,
          pay: s.pay,
          km: s.km,
          km_pay: s.km_pay,
          material: s.material_amount,
          total: s.total,
          note: s.note_work || s.material_desc || "",
          source_event_id: s.source_event_id,
          is_paid: s.is_paid,
        });
      }
      for (const p of d.programming || []) {
        out.push({
          key: `P_${p.source_event_id}`,
          day: d.day,
          user_name: d.user_name,
          site_name: p.site_name,
          kind: "PROGRAM",
          time: "programování",
          hours: p.hours,
          rate: p.hourly_rate,
          pay: p.pay,
          total: p.pay,
          note: p.note || "",
          source_event_id: p.source_event_id,
          is_paid: p.is_paid,
        });
      }
      for (const o of d.offsites || []) {
        out.push({
          key: `O_${o.source_event_id}`,
          day: d.day,
          user_name: d.user_name,
          site_name: o.site_name,
          kind: "OFFSITE",
          time: "mimo stavbu",
          hours: o.hours,
          rate: o.hourly_rate,
          pay: o.pay,
          total: o.pay,
          note: o.reason,
          source_event_id: o.source_event_id,
          is_paid: o.is_paid,
        });
      }
    }
    out.sort((a, b) => {
      if (a.is_paid !== b.is_paid) return a.is_paid ? 1 : -1;
      if (a.day !== b.day) return a.day < b.day ? 1 : -1;
      if (a.user_name !== b.user_name) return a.user_name.localeCompare(b.user_name);
      return a.kind.localeCompare(b.kind);
    });
    return out;
  }

  async function load() {
    setErr(null); setInfo(null);
    const t = getToken();
    if (!t) return;
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (siteId) qs.set("site_id", siteId);
    if (userId) qs.set("user_id", userId);
    qs.set("limit", "800");
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/attendance?${qs.toString()}`, { headers: { authorization: `Bearer ${t}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Chyba");
      const dayRows = (data.rows || []) as DayRow[];
      setRows(dayRows);
      setFlatRows(flatten(dayRows));
    } catch (e: any) {
      setErr(e.message || "Chyba");
    } finally {
      setLoading(false);
    }
  }

  async function deleteRow(r: FlatRow) {
    const t = getToken();
    if (!t) return;
    setBusyId(r.key); setErr(null); setInfo(null);
    try {
      let res: Response;
      if (r.kind === "PROGRAM") {
        res = await fetch(`/api/admin/events/${r.source_event_id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
          body: JSON.stringify({ programming_hours: 0, programming_note: null }),
        });
      } else {
        res = await fetch(`/api/admin/events/${r.source_event_id}`, {
          method: "DELETE",
          headers: { authorization: `Bearer ${t}` },
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nešlo smazat.");
      setInfo(r.kind === "PROGRAM" ? "Programování smazáno." : "Záznam smazán.");
      await load();
    } catch (e: any) {
      setErr(e.message || "Chyba");
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="space-y-4 px-3 pb-8">
      <div className="rounded-3xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Docházka</h1>
            <p className="mt-1 text-sm text-neutral-600">Jeden řádek pro práci, druhý pro programování, zvlášť mimo stavbu. Bez chaosu IN/OUT eventů.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="rounded-2xl border bg-white px-4 py-2 text-sm shadow-sm" href="/admin">Zpět do adminu</Link>
            <button onClick={load} disabled={loading} className="rounded-2xl border bg-white px-4 py-2 text-sm shadow-sm disabled:opacity-50">{loading ? "Načítám…" : "Obnovit"}</button>
          </div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-4">
          <div>
            <label className="text-xs text-neutral-600">Od</label>
            <input className="mt-1 w-full rounded-2xl border px-3 py-2 text-sm" type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-neutral-600">Do</label>
            <input className="mt-1 w-full rounded-2xl border px-3 py-2 text-sm" type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-neutral-600">Stavba</label>
            <select className="mt-1 w-full rounded-2xl border bg-white px-3 py-2 text-sm" value={siteId} onChange={e => setSiteId(e.target.value)}>
              <option value="">Vše</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-neutral-600">Uživatel</label>
            <select className="mt-1 w-full rounded-2xl border bg-white px-3 py-2 text-sm" value={userId} onChange={e => setUserId(e.target.value)}>
              <option value="">Všichni</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        </div>
        {(err || info) && <div className="mt-3 space-y-2">{err && <div className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{err}</div>}{info && <div className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div>}</div>}
      </div>

      <div className="overflow-hidden rounded-3xl border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1200px] w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="border-b px-3 py-3 text-left">Den</th>
                <th className="border-b px-3 py-3 text-left">Uživatel</th>
                <th className="border-b px-3 py-3 text-left">Stavba</th>
                <th className="border-b px-3 py-3 text-left">Typ</th>
                <th className="border-b px-3 py-3 text-left">Čas</th>
                <th className="border-b px-3 py-3 text-right">Hodiny</th>
                <th className="border-b px-3 py-3 text-right">Sazba</th>
                <th className="border-b px-3 py-3 text-right">Práce</th>
                <th className="border-b px-3 py-3 text-right">Km</th>
                <th className="border-b px-3 py-3 text-right">Doprava</th>
                <th className="border-b px-3 py-3 text-right">Materiál</th>
                <th className="border-b px-3 py-3 text-right">Celkem</th>
                <th className="border-b px-3 py-3 text-left">Poznámka</th>
                <th className="border-b px-3 py-3 text-left">Stav</th>
                <th className="border-b px-3 py-3 text-right">Akce</th>
              </tr>
            </thead>
            <tbody>
              {flatRows.map((r, idx) => (
                <tr key={r.key} className={idx % 2 === 0 ? "bg-white" : "bg-neutral-50/50"}>
                  <td className="border-b px-3 py-2 whitespace-nowrap">{r.day}</td>
                  <td className="border-b px-3 py-2 whitespace-nowrap">{r.user_name}</td>
                  <td className="border-b px-3 py-2 whitespace-nowrap">{r.site_name || "—"}</td>
                  <td className="border-b px-3 py-2 whitespace-nowrap">{r.kind === "WORK" ? "Práce" : r.kind === "PROGRAM" ? "Programování" : "Mimo stavbu"}</td>
                  <td className="border-b px-3 py-2 whitespace-nowrap">{r.time}</td>
                  <td className="border-b px-3 py-2 text-right">{fmt(r.hours)}</td>
                  <td className="border-b px-3 py-2 text-right">{fmt(r.rate)} Kč</td>
                  <td className="border-b px-3 py-2 text-right">{fmt(r.pay)} Kč</td>
                  <td className="border-b px-3 py-2 text-right">{r.km != null ? fmt(r.km) : "—"}</td>
                  <td className="border-b px-3 py-2 text-right">{r.km_pay != null ? fmt(r.km_pay) + " Kč" : "—"}</td>
                  <td className="border-b px-3 py-2 text-right">{r.material != null ? fmt(r.material) + " Kč" : "—"}</td>
                  <td className="border-b px-3 py-2 text-right font-medium">{fmt(r.total)} Kč</td>
                  <td className="border-b px-3 py-2 min-w-[240px]">{r.note || "—"}</td>
                  <td className="border-b px-3 py-2 whitespace-nowrap">{r.is_paid ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">Zaplaceno</span> : <span className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">Nezaplaceno</span>}</td>
                  <td className="border-b px-3 py-2 text-right">
                    {!r.is_paid && <button className="rounded-xl border px-3 py-1 text-xs disabled:opacity-50" onClick={() => deleteRow(r)} disabled={busyId === r.key}>{busyId === r.key ? "Mažu…" : "Smazat"}</button>}
                  </td>
                </tr>
              ))}
              {flatRows.length === 0 && (
                <tr><td colSpan={15} className="px-3 py-8 text-center text-neutral-500">Žádná data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
