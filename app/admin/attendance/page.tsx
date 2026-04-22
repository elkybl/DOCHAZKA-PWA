"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppNav";
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

type EditState = {
  site_id: string;
  note: string;
  km: string;
  material: string;
  hours: string;
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

function fmt(n: unknown) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  return x.toLocaleString("cs-CZ", { maximumFractionDigits: 2 });
}

function initialDateParam(name: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) || "";
}

function numInput(value: string) {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed.replace(",", "."));
}

export default function AdminAttendancePage() {
  const router = useRouter();
  const me = useMemo(() => getMe(), []);
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [from, setFrom] = useState(() => initialDateParam("day"));
  const [to, setTo] = useState(() => initialDateParam("day"));
  const [focusedDay, setFocusedDay] = useState(() => initialDateParam("day"));
  const [siteId, setSiteId] = useState(() => initialDateParam("site_id"));
  const [userId, setUserId] = useState(() => initialDateParam("user_id"));
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState>({ site_id: "", note: "", km: "", material: "", hours: "" });

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

  async function load(options?: { focusedDay?: string; clearDates?: boolean }) {
    setErr(null);
    setInfo(null);
    const t = getToken();
    if (!t) return;
    const qs = new URLSearchParams();
    const day = options?.focusedDay ?? focusedDay;
    if (day) qs.set("day", day);
    else if (!options?.clearDates && from && to && from === to) qs.set("day", from);
    if (!options?.clearDates && from) qs.set("from", from);
    if (!options?.clearDates && to) qs.set("to", to);
    if (siteId) qs.set("site_id", siteId);
    if (userId) qs.set("user_id", userId);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/attendance-summary?${qs.toString()}`, { headers: { authorization: `Bearer ${t}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Chyba načtení.");
      setRows(data.rows || []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Chyba načtení.");
    } finally {
      setLoading(false);
    }
  }

  function startEdit(r: Row) {
    setEditingId(r.id);
    setEdit({
      site_id: r.site_id || "",
      note: r.note || "",
      km: String(r.km || ""),
      material: String(r.material || ""),
      hours: String(r.hours || ""),
    });
    setErr(null);
    setInfo(null);
  }

  async function patchEvent(id: string, payload: Record<string, unknown>) {
    const t = getToken();
    if (!t) throw new Error("Chybí přihlášení.");
    const res = await fetch(`/api/admin/events/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Nešlo uložit změny.");
  }

  async function saveRow(r: Row) {
    if (!r.sourceId && !r.sourceIds?.length) return;
    setErr(null);
    setInfo(null);
    setBusyId(r.id);
    try {
      const sitePayload = { site_id: edit.site_id || null };
      if (r.sourceKind === "WORK") {
        for (const id of r.sourceIds || []) await patchEvent(id, sitePayload);
        if (r.sourceId) {
          await patchEvent(r.sourceId, {
            ...sitePayload,
            note_work: edit.note,
            km: numInput(edit.km),
            material_amount: numInput(edit.material),
          });
        }
      } else if (r.sourceKind === "PROGRAM" && r.sourceId) {
        await patchEvent(r.sourceId, {
          ...sitePayload,
          programming_hours: numInput(edit.hours),
          programming_note: edit.note,
        });
      } else if (r.sourceKind === "OFFSITE" && r.sourceId) {
        await patchEvent(r.sourceId, {
          ...sitePayload,
          offsite_reason: edit.note,
          offsite_hours: numInput(edit.hours),
          material_amount: numInput(edit.material),
        });
      }

      setInfo("Uloženo.");
      setEditingId(null);
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Nešlo uložit změny.");
    } finally {
      setBusyId(null);
    }
  }

  async function delRow(r: Row) {
    const t = getToken();
    if (!t || !r.sourceId) return;
    setErr(null);
    setInfo(null);
    setBusyId(r.id);
    try {
      if (r.sourceKind === "PROGRAM") {
        await patchEvent(r.sourceId, { programming_hours: 0, programming_note: "" });
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
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Chyba mazání.");
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell
      area="mixed"
      title="Docházka"
      subtitle={focusedDay ? `Detail dne ${focusedDay}` : "Přehled dnů, opravy záznamů, mazání a změna stavby."}
      actions={
        <button onClick={() => load()} disabled={loading} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-50">
          {loading ? "Načítám" : "Obnovit"}
        </button>
      }
    >
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <Field label="Stavba">
            <select className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">Všechny</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Uživatel">
            <select className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Všichni</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <div className="flex items-end gap-2">
            <button onClick={() => load()} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Načíst</button>
            {focusedDay ? (
              <button
                onClick={() => {
                  setFocusedDay("");
                  setFrom("");
                  setTo("");
                  load({ focusedDay: "", clearDates: true });
                }}
                className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold"
              >
                Vše
              </button>
            ) : null}
          </div>
        </div>
        {(err || info) && (
          <div className="mt-3 space-y-2">
            {err && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>}
            {info && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div>}
          </div>
        )}
      </section>

      <section className="mt-4 space-y-3">
        {rows.map((r) => {
          const isEditing = editingId === r.id;
          return (
            <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{r.day} · {r.user_name}</div>
                  <div className="mt-1 text-xs text-slate-600">{r.site_name || "Bez stavby"} · {r.title}</div>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${r.paid ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                  {r.paid ? "Zaplaceno" : "Nezaplaceno"}
                </span>
              </div>

              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <Info label="Čas" value={`${fmtTimeCZFromIso(r.first_in)} → ${fmtTimeCZFromIso(r.last_out)}`} sub={`${fmt(r.hours)} h`} />
                <Info label="Práce" value={`${fmt(r.pay)} Kč`} sub={`${fmt(r.hourly_rate)} Kč/h`} />
                <Info label="Doprava / materiál" value={`${fmt(r.km)} km · ${fmt(r.km_pay)} Kč`} sub={`Materiál ${fmt(r.material)} Kč`} />
                <Info label="Celkem" value={`${fmt(r.total)} Kč`} sub={r.paid ? "Zaplaceno" : "Nezaplaceno"} />
              </div>
              <div className="mt-3 rounded-lg border bg-slate-50 p-3">
                <div className="text-xs font-medium text-slate-500">Práce</div>
                <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{r.note || "Bez popisu práce"}</div>
              </div>

              {isEditing && (
                <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/50 p-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Stavba">
                      <select className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm" value={edit.site_id} onChange={(e) => setEdit((p) => ({ ...p, site_id: e.target.value }))}>
                        <option value="">Bez stavby</option>
                        {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </Field>
                    <Field label={r.sourceKind === "PROGRAM" || r.sourceKind === "OFFSITE" ? "Hodiny" : "Kilometry"}>
                      <input
                        className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm"
                        inputMode="decimal"
                        value={r.sourceKind === "WORK" ? edit.km : edit.hours}
                        onChange={(e) =>
                          setEdit((p) => r.sourceKind === "WORK" ? { ...p, km: e.target.value.replace(/[^\d.,]/g, "") } : { ...p, hours: e.target.value.replace(/[^\d.,]/g, "") })
                        }
                      />
                    </Field>
                    <Field label="Materiál Kč">
                      <input className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm" inputMode="decimal" value={edit.material} onChange={(e) => setEdit((p) => ({ ...p, material: e.target.value.replace(/[^\d.,]/g, "") }))} />
                    </Field>
                    <Field label="Popis">
                      <input className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm" value={edit.note} onChange={(e) => setEdit((p) => ({ ...p, note: e.target.value }))} />
                    </Field>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button className="rounded-lg border bg-white px-3 py-2 text-sm" onClick={() => setEditingId(null)}>Zrušit</button>
                    <button className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => saveRow(r)} disabled={busyId === r.id}>
                      {busyId === r.id ? "Ukládám" : "Uložit"}
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => startEdit(r)}>Upravit</button>
                <button className="rounded-lg border px-3 py-2 text-sm hover:bg-red-50 disabled:opacity-50" onClick={() => delRow(r)} disabled={busyId === r.id}>
                  {busyId === r.id ? "Mažu" : r.sourceKind === "PROGRAM" ? "Odstranit programování" : "Smazat"}
                </button>
              </div>
            </div>
          );
        })}

        {rows.length === 0 && <div className="rounded-lg border bg-white p-6 text-center text-sm text-slate-500 shadow-sm">Žádné záznamy.</div>}
      </section>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      {children}
    </label>
  );
}

function Info({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
      <div className="mt-1 truncate text-xs text-slate-600">{sub}</div>
    </div>
  );
}
