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
  server_time: string;
  time_raw: string;
  time_rounded: string;

  in_time?: string;
  in_time_raw?: string;
  in_time_rounded?: string;
  out_time_raw?: string;
  out_time_rounded?: string;
  minutes_raw?: number;
  minutes_rounded?: number;
  hours_rounded?: number;
  pay_hours?: number;

  note_work?: string | null;
  km?: number | null;
  offsite_reason?: string | null;
  offsite_hours?: number | null;
  material_desc?: string | null;
  material_amount?: number | null;
  is_paid: boolean;

  rate_hourly: number;
  rate_km: number;
  rate_source: "site" | "default";
};

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

function getUser() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user");
  return raw ? JSON.parse(raw) : null;
}

function fmt(n: any) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  return x.toLocaleString("cs-CZ", { maximumFractionDigits: 2 });
}

export default function AdminAttendancePage() {
  const router = useRouter();
  const me = useMemo(() => getUser(), []);
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

    // load sites + users for filters
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
    qs.set("limit", "300");

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
      const res = await fetch("/api/admin/repair/in-times", {
        method: "POST",
        headers: { authorization: `Bearer ${t}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nešlo opravit.");
      setInfo(`Oprava IN hotová: matched ${data.matched}, fixed ${data.fixed}.`);
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
    <main className="space-y-4 px-3">
      <div className="rounded-3xl border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs text-neutral-500">Admin</div>
            <h1 className="text-lg font-semibold">Docházka – detailní záznamy</h1>
            <div className="mt-2 text-xs text-neutral-600">
              Zde vidíš jednotlivé eventy (IN/OUT/OFFSITE), včetně zaokrouhlených časů a částek. Můžeš mazat jednotlivé záznamy.
            </div>
            <Link className="mt-2 inline-block text-xs underline text-neutral-600" href="/admin">
              Zpět do adminu
            </Link>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="rounded-2xl border bg-white px-4 py-2 text-sm shadow-sm disabled:opacity-50"
            >
              {loading ? "Načítám…" : "Obnovit"}
            </button>
            <button
              onClick={runRepair}
              disabled={loading}
              className="rounded-2xl border bg-amber-50 px-4 py-2 text-sm shadow-sm disabled:opacity-50"
              title="Opraví IN eventy cca o 1h posunuté oproti žádostem."
            >
              Opravit posunuté IN
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-5">
          <div>
            <label className="text-xs text-neutral-600">Od</label>
            <input className="mt-1 w-full rounded-2xl border px-3 py-2 text-sm" type="date" value={from} onChange={(e)=>setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-neutral-600">Do</label>
            <input className="mt-1 w-full rounded-2xl border px-3 py-2 text-sm" type="date" value={to} onChange={(e)=>setTo(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-neutral-600">Stavba</label>
            <select className="mt-1 w-full rounded-2xl border bg-white px-3 py-2 text-sm" value={siteId} onChange={(e)=>setSiteId(e.target.value)}>
              <option value="">Vše</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-neutral-600">Uživatel</label>
            <select className="mt-1 w-full rounded-2xl border bg-white px-3 py-2 text-sm" value={userId} onChange={(e)=>setUserId(e.target.value)}>
              <option value="">Všichni</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-neutral-600">Typ</label>
            <select className="mt-1 w-full rounded-2xl border bg-white px-3 py-2 text-sm" value={type} onChange={(e)=>setType(e.target.value)}>
              <option value="">Vše</option>
              <option value="IN">IN</option>
              <option value="OUT">OUT</option>
              <option value="OFFSITE">OFFSITE</option>
            </select>
          </div>
        </div>

        {(err || info) && (
          <div className="mt-4 space-y-2">
            {err && <div className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{err}</div>}
            {info && <div className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div>}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-3xl border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-700">
              <tr>
                <th className="px-3 py-3 text-left">Den</th>
                <th className="px-3 py-3 text-left">Uživatel</th>
                <th className="px-3 py-3 text-left">Stavba</th>
                <th className="px-3 py-3 text-left">Typ</th>
                <th className="px-3 py-3 text-left">Čas (raw)</th>
                <th className="px-3 py-3 text-left">Čas (round)</th>
                <th className="px-3 py-3 text-left">IN round</th>
                <th className="px-3 py-3 text-left">OUT round</th>
                <th className="px-3 py-3 text-right">H</th>
                <th className="px-3 py-3 text-right">Sazba</th>
                <th className="px-3 py-3 text-right">Částka</th>
                <th className="px-3 py-3 text-left">Poznámka</th>
                <th className="px-3 py-3 text-right">Akce</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">{r.day}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.user_name}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.site_name || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.type}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.time_raw}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.time_rounded}</td>

                  <td className="px-3 py-2 whitespace-nowrap">{r.in_time_rounded || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.out_time_rounded || "—"}</td>

                  <td className="px-3 py-2 text-right">{r.hours_rounded != null ? fmt(r.hours_rounded) : "—"}</td>
                  <td className="px-3 py-2 text-right">{r.rate_hourly ? fmt(r.rate_hourly) : "—"}</td>
                  <td className="px-3 py-2 text-right">{r.pay_hours != null ? fmt(r.pay_hours) : "—"}</td>

                  <td className="px-3 py-2 min-w-[320px]">
                    {r.type === "OUT" ? (r.note_work || "—") : r.type === "OFFSITE" ? (r.offsite_reason || "—") : "—"}
                  </td>

                  <td className="px-3 py-2 text-right">
                    <button
                      className="rounded-xl border px-3 py-1 text-xs hover:bg-red-50 disabled:opacity-50"
                      onClick={() => delEvent(r.id)}
                      disabled={busyId === r.id}
                    >
                      {busyId === r.id ? "…" : "Smazat"}
                    </button>
                  </td>
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-neutral-500" colSpan={13}>
                    Žádné záznamy.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-neutral-500 px-1">
        Tip: Pokud jsou některé příchody o 1h posunuté, použij “Opravit posunuté IN”. Oprava se snaží měnit jen bezpečné případy.
      </div>
    </main>
  );
}
