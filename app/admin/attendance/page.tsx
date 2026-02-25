"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, SubCard, MenuLink, Pill, Button } from "@/app/components/ui";
import { fmtDateTimeCZFromIso } from "@/lib/time";

type Site = { id: string; name: string };
type User = { id: string; name: string; role: "admin" | "worker" };

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}
function getUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user");
  return raw ? JSON.parse(raw) : null;
}
function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type DayRow = {
  user_id: string;
  user_name: string;
  day: string;
  sites: string[];
  hours: number;
  hours_pay: number;
  km: number;
  km_pay: number;
  material: number;
  total: number;
  paid: boolean;
};

type EventRow = {
  id: string;
  user_id: string;
  user_name: string;
  site_id: string | null;
  site_name: string | null;
  type: "IN" | "OUT" | "OFFSITE";
  server_time: string;
  note_work: string | null;
  km: number | null;
  offsite_reason: string | null;
  offsite_hours: number | null;
  material_desc: string | null;
  material_amount: number | null;
  is_paid: boolean;
};

export default function AdminAttendancePage() {
  const router = useRouter();
  const me = useMemo(() => getUser(), []);

  const [tab, setTab] = useState<"days" | "events">("days");

  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [siteId, setSiteId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const [daysRows, setDaysRows] = useState<DayRow[]>([]);
  const [eventRows, setEventRows] = useState<EventRow[]>([]);

  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.push("/login");
      return;
    }
    if (me?.role !== "admin") {
      router.push("/attendance");
      return;
    }

    // preload filters
    fetch("/api/admin/sites", { headers: { authorization: `Bearer ${t}` } })
      .then((r) => r.json())
      .then((d) => setSites(d.sites || []))
      .catch(() => setSites([]));

    fetch("/api/admin/users", { headers: { authorization: `Bearer ${t}` } })
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []))
      .catch(() => setUsers([]));

    // default range: last 14 days
    const now = new Date();
    const fromD = new Date(Date.now() - 14 * 86400000);
    setFrom(fromD.toISOString().slice(0, 10));
    setTo(now.toISOString().slice(0, 10));
  }, [router, me?.role]);

  async function load() {
    setErr(null);
    setInfo(null);
    const t = getToken();
    if (!t) return;

    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);

    if (tab === "days") {
      const res = await fetch(`/api/admin/attendance?${qs.toString()}`, {
        headers: { authorization: `Bearer ${t}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setErr(data?.error || "Chyba");

      let rows: DayRow[] = data.rows || [];
      if (siteId) rows = rows.filter((r) => (r.sites || []).includes(siteId));
      if (userId) rows = rows.filter((r) => r.user_id === userId);

      setDaysRows(rows);
      return;
    }

    // events tab
    if (siteId) qs.set("site_id", siteId);
    if (userId) qs.set("user_id", userId);

    const res = await fetch(`/api/admin/events?${qs.toString()}`, {
      headers: { authorization: `Bearer ${t}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(data?.error || "Chyba");
    setEventRows(data.rows || []);
  }

  useEffect(() => {
    // load when tab or filters change
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, siteId, userId, from, to]);

  async function delEvent(id: string) {
    setErr(null);
    setInfo(null);
    const t = getToken();
    if (!t) return;

    setBusy(id);
    try {
      const res = await fetch(`/api/admin/events/${id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${t}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nešlo smazat.");
      setInfo("Záznam smazán.");
      await load();
    } catch (e: any) {
      setErr(e.message || "Chyba");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="space-y-4 px-3">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Admin – Docházka</h1>
            <p className="mt-1 text-xs text-neutral-500">
              Přehled po dnech (výplaty) a detailní záznamy (mazání/editace).
            </p>
          </div>
          <Link className="text-sm underline" href="/admin">
            Zpět do adminu
          </Link>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Button variant={tab === "days" ? "primary" : "secondary"} onClick={() => setTab("days")}>
            Souhrn po dnech
          </Button>
          <Button variant={tab === "events" ? "primary" : "secondary"} onClick={() => setTab("events")}>
            Detailní záznamy
          </Button>
        </div>

        <SubCard>
          <div className="text-sm font-semibold">Filtry</div>

          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <div>
              <label className="block text-xs text-neutral-600">Od</label>
              <input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-neutral-600">Do</label>
              <input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-neutral-600">Stavba</label>
              <select className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                <option value="">Vše</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-neutral-600">Uživatel</label>
              <select className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">Všichni</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3">
            <Button variant="secondary" onClick={load}>Obnovit</Button>
          </div>
        </SubCard>

        {err && <div className="mt-3 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{err}</div>}
        {info && <div className="mt-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">{info}</div>}
      </Card>

      {tab === "days" ? (
        <div className="space-y-2">
          {daysRows.map((r, i) => (
            <Card key={i}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{r.day} • {r.user_name}</div>
                  <div className="mt-1 text-xs text-neutral-600">
                    Stavby: {(r.sites || []).length ? (r.sites || []).join(", ") : "—"}
                  </div>
                </div>
                <Pill tone={r.paid ? "ok" : "warn"}>{r.paid ? "Zaplaceno" : "Nezaplaceno"}</Pill>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-4 text-sm">
                <div className="rounded-2xl border bg-neutral-50 p-3">
                  <div className="text-xs text-neutral-600">Hodiny</div>
                  <div className="font-semibold">{r.hours} h</div>
                  <div className="text-xs text-neutral-600">{r.hours_pay} Kč</div>
                </div>
                <div className="rounded-2xl border bg-neutral-50 p-3">
                  <div className="text-xs text-neutral-600">Km</div>
                  <div className="font-semibold">{r.km} km</div>
                  <div className="text-xs text-neutral-600">{r.km_pay} Kč</div>
                </div>
                <div className="rounded-2xl border bg-neutral-50 p-3">
                  <div className="text-xs text-neutral-600">Materiál</div>
                  <div className="font-semibold">{r.material} Kč</div>
                </div>
                <div className="rounded-2xl border bg-neutral-50 p-3">
                  <div className="text-xs text-neutral-600">Celkem</div>
                  <div className="font-semibold">{r.total} Kč</div>
                </div>
              </div>
            </Card>
          ))}
          {daysRows.length === 0 && (
            <Card>
              <div className="text-sm text-neutral-600">Žádná data pro zvolené období.</div>
            </Card>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {eventRows.map((e) => (
            <Card key={e.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{e.user_name} • {e.type} • {e.site_name || "—"}</div>
                  <div className="mt-1 text-xs text-neutral-600">{fmtDateTimeCZFromIso(e.server_time)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Pill tone={e.is_paid ? "ok" : "warn"}>{e.is_paid ? "Zaplaceno" : "Nezaplaceno"}</Pill>
                  <Button variant="secondary" disabled={busy === e.id} onClick={() => delEvent(e.id)}>
                    {busy === e.id ? "Mažu…" : "Smazat"}
                  </Button>
                </div>
              </div>

              {(e.note_work || e.offsite_reason || e.material_amount || e.km) ? (
                <div className="mt-3 text-sm text-neutral-700 space-y-1">
                  {e.note_work ? <div><span className="text-neutral-500">Práce:</span> {e.note_work}</div> : null}
                  {e.offsite_reason ? <div><span className="text-neutral-500">Mimo:</span> {e.offsite_reason} ({e.offsite_hours || 0} h)</div> : null}
                  {e.km ? <div><span className="text-neutral-500">Km:</span> {e.km}</div> : null}
                  {e.material_amount ? <div><span className="text-neutral-500">Materiál:</span> {(e.material_desc || "—")} • {e.material_amount} Kč</div> : null}
                </div>
              ) : null}
            </Card>
          ))}
          {eventRows.length === 0 && (
            <Card>
              <div className="text-sm text-neutral-600">Žádné záznamy pro zvolené filtry.</div>
            </Card>
          )}
        </div>
      )}
    </main>
  );
}
