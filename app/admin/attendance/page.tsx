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

type Group = {
  key: string;
  day: string;
  user_id: string;
  user_name: string;
  site_id: string | null;
  site_name: string | null;
  rows: Row[];
  paid: boolean;
  total: number;
  hours: number;
  km: number;
  material: number;
  first_in: string | null;
  last_out: string | null;
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

function sourceLabel(kind: Row["sourceKind"]) {
  if (kind === "WORK") return "Práce";
  if (kind === "PROGRAM") return "Programování";
  return "Mimo stavbu";
}

function buildGroupKey(row: Row) {
  return `${row.day}__${row.user_id}__${row.site_id || "none"}`;
}

function groupRows(rows: Row[]) {
  const map = new Map<string, Group>();
  for (const row of rows) {
    const key = buildGroupKey(row);
    const current = map.get(key) || {
      key,
      day: row.day,
      user_id: row.user_id,
      user_name: row.user_name,
      site_id: row.site_id,
      site_name: row.site_name,
      rows: [],
      paid: true,
      total: 0,
      hours: 0,
      km: 0,
      material: 0,
      first_in: row.first_in,
      last_out: row.last_out,
    };
    current.rows.push(row);
    current.paid = current.paid && row.paid;
    current.total += Number(row.total) || 0;
    current.hours += Number(row.hours) || 0;
    current.km += Number(row.km) || 0;
    current.material += Number(row.material) || 0;
    current.first_in = current.first_in || row.first_in;
    current.last_out = row.last_out || current.last_out;
    map.set(key, current);
  }

  return [...map.values()].sort((a, b) => {
    if (a.paid !== b.paid) return a.paid ? 1 : -1;
    if (a.day !== b.day) return a.day < b.day ? 1 : -1;
    return a.user_name.localeCompare(b.user_name, "cs");
  });
}

function groupFlags(group: Group) {
  const hasMissingNote = group.rows.some((row) => !row.note.trim());
  const hasMissingSite = group.rows.some((row) => !row.site_id);
  const hasZeroRow = group.rows.some((row) => Number(row.total) <= 0 && Number(row.hours) <= 0);
  const hasOpenDay = !group.last_out;
  return { hasMissingNote, hasMissingSite, hasZeroRow, hasOpenDay };
}

export default function AdminAttendancePage() {
  const router = useRouter();
  const me = useMemo(() => getMe(), []);
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);
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

  const groups = useMemo(() => groupRows(rows), [rows]);

  return (
    <AppShell
      area="mixed"
      title="Docházka"
      subtitle={focusedDay ? `Detail dne ${focusedDay}` : "Přehled dnů, opravy záznamů, mazání a změna stavby po jednotlivých pracovních dnech."}
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

      <section className="mt-4 space-y-4">
        {groups.map((group) => {
          const flags = groupFlags(group);
          return (
            <div key={group.key} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold">{group.day} · {group.user_name}</div>
                  <div className="mt-1 text-xs text-slate-600">{group.site_name || "Bez stavby"} · {fmtTimeCZFromIso(group.first_in)} → {fmtTimeCZFromIso(group.last_out)}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${group.paid ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                    {group.paid ? "Uhrazený den" : "Otevřený k úpravám"}
                  </span>
                  <div className="text-right text-lg font-semibold">{fmt(group.total)} Kč</div>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                <Info label="Hodiny" value={`${fmt(group.hours)} h`} sub="Součet za den" />
                <Info label="Doprava" value={`${fmt(group.km)} km`} sub="Součet kilometrů" />
                <Info label="Materiál" value={`${fmt(group.material)} Kč`} sub="Navázané položky" />
                <Info label="Řádky dne" value={String(group.rows.length)} sub="Práce, programování, mimo stavbu" />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {flags.hasMissingNote ? <FlagBadge tone="amber" text="Chybí popis práce" /> : null}
                {flags.hasMissingSite ? <FlagBadge tone="red" text="Chybí stavba" /> : null}
                {flags.hasZeroRow ? <FlagBadge tone="blue" text="Je tu nulový řádek" /> : null}
                {flags.hasOpenDay ? <FlagBadge tone="slate" text="Den nemá odchod" /> : null}
                {!flags.hasMissingNote && !flags.hasMissingSite && !flags.hasZeroRow && !flags.hasOpenDay ? <FlagBadge tone="emerald" text="Den vypadá v pořádku" /> : null}
              </div>

              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Časová osa dne</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {group.rows.map((row) => (
                    <span key={`${group.key}_${row.id}`} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                      {sourceLabel(row.sourceKind)} · {fmtTimeCZFromIso(row.first_in)} → {fmtTimeCZFromIso(row.last_out)}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {group.rows.map((r) => {
                  const isEditing = editingId === r.id;
                  const locked = r.paid;
                  return (
                    <div key={r.id} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">{sourceLabel(r.sourceKind)}</div>
                          <div className="mt-1 text-xs text-slate-600">{r.site_name || "Bez stavby"} · {r.title}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold">{fmt(r.total)} Kč</div>
                          <div className={`mt-1 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${locked ? "bg-emerald-50 text-emerald-800" : "bg-blue-50 text-blue-800"}`}>
                            {locked ? "Zamčeno úhradou" : "Lze upravit"}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                        <Info label="Čas" value={`${fmtTimeCZFromIso(r.first_in)} → ${fmtTimeCZFromIso(r.last_out)}`} sub={`${fmt(r.hours)} h`} />
                        <Info label="Práce" value={`${fmt(r.pay)} Kč`} sub={`${fmt(r.hourly_rate)} Kč/h`} />
                        <Info label="Doprava a materiál" value={`${fmt(r.km)} km · ${fmt(r.km_pay)} Kč`} sub={`Materiál ${fmt(r.material)} Kč`} />
                        <Info label="Celkem" value={`${fmt(r.total)} Kč`} sub={locked ? "Uhrazeno" : "K úpravě"} />
                      </div>
                      <div className="mt-3 rounded-lg border bg-slate-50 p-3">
                        <div className="text-xs font-medium text-slate-500">Popis práce</div>
                        <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{r.note || "Bez popisu práce"}</div>
                      </div>

                      {isEditing ? (
                        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/50 p-4">
                          {locked ? (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Tento řádek je uhrazený. Pokud ho potřebujete upravit, nejdřív ho vraťte ve výplatách mezi neuhrazené.</div>
                          ) : (
                            <>
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
                            </>
                          )}
                        </div>
                      ) : null}

                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <button className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50" onClick={() => startEdit(r)} disabled={locked}>Upravit</button>
                        <button className="rounded-lg border px-3 py-2 text-sm hover:bg-red-50 disabled:opacity-50" onClick={() => delRow(r)} disabled={busyId === r.id || locked}>
                          {busyId === r.id ? "Mažu" : r.sourceKind === "PROGRAM" ? "Odstranit programování" : "Smazat"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {groups.length === 0 && <div className="rounded-lg border bg-white p-6 text-center text-sm text-slate-500 shadow-sm">Žádné záznamy.</div>}
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
      <div className="mt-1 text-xs text-slate-600">{sub}</div>
    </div>
  );
}

function FlagBadge({ text, tone }: { text: string; tone: "amber" | "red" | "blue" | "slate" | "emerald" }) {
  const cls =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : tone === "red"
        ? "border-red-200 bg-red-50 text-red-800"
        : tone === "blue"
          ? "border-blue-200 bg-blue-50 text-blue-800"
          : tone === "emerald"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-slate-200 bg-slate-100 text-slate-700";
  return <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${cls}`}>{text}</span>;
}
