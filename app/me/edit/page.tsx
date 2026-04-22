"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppNav";
import { fmtDateTimeCZFromIso } from "@/lib/time";

type Row = {
  id: string;
  type: "OUT" | "OFFSITE";
  server_time: string;
  site_id: string | null;
  site_name: string | null;
  note_work: string;
  km: number;
  programming_hours: number;
  programming_note: string;
  offsite_reason: string;
  offsite_hours: number;
  material_desc: string;
  material_amount: number;
  is_paid: boolean;
};

type ProfileResponse = {
  user?: { is_programmer?: boolean | null } | null;
};

type SummaryRow = {
  day: string;
  hours: number;
  segments?: Array<{ prog_hours?: number; site_hours?: number; hours_rounded?: number }>;
  offsites?: Array<{ hours?: number }>;
};

type DayInfo = {
  hours: number;
  programming: number;
  work: number;
  offsite: number;
};

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

function fmt(n: unknown, max = 2) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  return x.toLocaleString("cs-CZ", { maximumFractionDigits: max });
}

function onlyNumber(value: string) {
  return value.replace(/[^\d.,]/g, "").replace(",", ".");
}

function dayKeyPrague(iso: string) {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const out: Record<string, string> = {};
  for (const part of parts) out[part.type] = part.value;
  return `${out.year}-${out.month}-${out.day}`;
}

function initialDayParam() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("day") || "";
}

export default function EditWorkPage() {
  const [token, setToken] = useState<string | null>(null);
  const [canProg, setCanProg] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [dayInfo, setDayInfo] = useState<Record<string, DayInfo>>({});
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "work" | "offsite">("all");
  const [dayFilter, setDayFilter] = useState("");
  const [draftOffsite, setDraftOffsite] = useState<Record<string, { reason: string; hours: string }>>({});

  useEffect(() => {
    setToken(getToken());
    setDayFilter(initialDayParam());
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch("/api/me/profile", { headers: { authorization: `Bearer ${token}` } })
      .then((r) => r.json().catch(() => ({} as ProfileResponse)) as Promise<ProfileResponse>)
      .then((data) => setCanProg(!!data.user?.is_programmer))
      .catch(() => setCanProg(false));
  }, [token]);

  async function load(currentToken = token) {
    setErr(null);
    setInfo(null);
    if (!currentToken) return;

    const res = await fetch("/api/me/events?days=120&only_unpaid=1", {
      headers: { authorization: `Bearer ${currentToken}` },
    });
    const data = (await res.json().catch(() => ({}))) as { rows?: Row[]; error?: string };
    if (!res.ok) {
      setErr(data.error || "Chyba načtení.");
      return;
    }
    setRows(data.rows || []);

    const summaryRes = await fetch("/api/me/summary?days=180", {
      headers: { authorization: `Bearer ${currentToken}` },
    });
    const summaryData = (await summaryRes.json().catch(() => ({}))) as { rows?: SummaryRow[] };
    const next: Record<string, DayInfo> = {};
    for (const day of summaryData.rows || []) {
      const programming = (day.segments || []).reduce((sum, seg) => sum + (Number(seg.prog_hours) || 0), 0);
      const offsite = (day.offsites || []).reduce((sum, off) => sum + (Number(off.hours) || 0), 0);
      next[day.day] = {
        hours: Number(day.hours) || 0,
        programming,
        offsite,
        work: Math.max(0, (Number(day.hours) || 0) - offsite),
      };
    }
    setDayInfo(next);
  }

  useEffect(() => {
    if (token) load(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function save(row: Row) {
    if (!token) return;
    if (row.is_paid) {
      setErr("Zaplacený záznam nelze upravit.");
      return;
    }

    setBusy(row.id);
    setErr(null);
    setInfo(null);
    try {
      const payload: Record<string, string | number> = { id: row.id };
      if (row.type === "OUT") {
        payload.note_work = row.note_work || "";
        payload.km = Number(row.km || 0);
        if (canProg) {
          payload.programming_hours = Number(row.programming_hours || 0);
          payload.programming_note = row.programming_note || "";
        }
      } else {
        payload.offsite_reason = row.offsite_reason || "";
        payload.offsite_hours = Number(row.offsite_hours || 0);
      }
      payload.material_desc = row.material_desc || "";
      payload.material_amount = Number(row.material_amount || 0);

      const res = await fetch("/api/attendance/edit", {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Nešlo uložit.");

      setInfo("Uloženo.");
      await load(token);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Chyba uložení.");
    } finally {
      setBusy(null);
    }
  }

  async function createOffsite(row: Row) {
    if (!token) return;
    const day = dayKeyPrague(row.server_time);
    const key = `${day}__${row.site_id || ""}`;
    const draft = draftOffsite[key] || { reason: "", hours: "" };
    const hours = Number(onlyNumber(draft.hours));
    if (!draft.reason.trim()) return setErr("Doplň popis činnosti mimo stavbu.");
    if (!Number.isFinite(hours) || hours <= 0) return setErr("Doplň počet hodin.");

    setBusy(row.id);
    setErr(null);
    setInfo(null);
    try {
      const res = await fetch("/api/attendance/offsite", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          day_local: day,
          site_id: row.site_id || null,
          offsite_reason: draft.reason.trim(),
          offsite_hours: hours,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Nešlo uložit mimo stavbu.");
      setInfo("Mimo stavbu uloženo.");
      setDraftOffsite((prev) => ({ ...prev, [key]: { reason: "", hours: "" } }));
      await load(token);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Chyba uložení.");
    } finally {
      setBusy(null);
    }
  }

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((row) => (dayFilter ? dayKeyPrague(row.server_time) === dayFilter : true))
      .filter((row) => (typeFilter === "all" ? true : typeFilter === "work" ? row.type === "OUT" : row.type === "OFFSITE"))
      .filter((row) => {
        if (!q) return true;
        return `${row.site_name || ""} ${row.note_work || ""} ${row.offsite_reason || ""}`.toLowerCase().includes(q);
      });
  }, [rows, query, typeFilter, dayFilter]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (sum, row) => ({
        work: sum.work + (row.type === "OUT" ? 1 : 0),
        offsite: sum.offsite + (row.type === "OFFSITE" ? 1 : 0),
        km: sum.km + (Number(row.km) || 0),
        material: sum.material + (Number(row.material_amount) || 0),
      }),
      { work: 0, offsite: 0, km: 0, material: 0 }
    );
  }, [filteredRows]);

  const activeDayInfo = dayFilter ? dayInfo[dayFilter] : null;

  return (
    <AppShell
      area="auto"
      title={dayFilter ? `Upravit den ${dayFilter}` : "Upravit záznamy"}
      subtitle="Doplnění práce, dopravy, materiálu a činností mimo stavbu."
      actions={
        <button onClick={() => load()} disabled={!token || !!busy} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50">
          Obnovit
        </button>
      }
    >
      <section className="grid gap-3 md:grid-cols-4">
        <Stat label={dayFilter ? "Hodiny dne" : "Záznamy práce"} value={dayFilter ? `${fmt(activeDayInfo?.hours || 0)} h` : `${totals.work}`} />
        <Stat label="Mimo stavbu" value={dayFilter ? `${fmt(activeDayInfo?.offsite || 0)} h` : `${totals.offsite}`} />
        <Stat label="Kilometry" value={`${fmt(totals.km, 1)} km`} />
        <Stat label={canProg ? "Programování" : "Materiál"} value={canProg ? `${fmt(activeDayInfo?.programming || 0)} h` : `${fmt(totals.material)} Kč`} />
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[220px_180px_1fr]">
          <div>
            <div className="text-xs font-medium text-slate-600">Typ</div>
            <div className="mt-2 grid grid-cols-3 rounded-lg border bg-slate-50 p-1">
              {(["all", "work", "offsite"] as const).map((item) => (
                <button key={item} className={`rounded-md px-2 py-2 text-xs font-semibold ${typeFilter === item ? "bg-slate-950 text-white" : "text-slate-600"}`} onClick={() => setTypeFilter(item)}>
                  {item === "all" ? "Vše" : item === "work" ? "Práce" : "Mimo"}
                </button>
              ))}
            </div>
          </div>
          <label className="block text-xs font-medium text-slate-600">
            Den
            <input className="mt-2 w-full rounded-lg border px-3 py-2 text-sm" type="date" value={dayFilter} onChange={(e) => setDayFilter(e.target.value)} />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Hledat
            <input className="mt-2 w-full rounded-lg border px-3 py-2 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Stavba nebo popis" />
          </label>
        </div>
        {dayFilter ? (
          <button className="mt-3 rounded-lg border px-3 py-2 text-sm font-semibold" onClick={() => setDayFilter("")}>
            Zobrazit všechny dny
          </button>
        ) : null}
        {err ? <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
        {info ? <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div> : null}
      </section>

      <section className="mt-4 space-y-3">
        {filteredRows.map((row) => (
          <EditCard
            key={row.id}
            row={row}
            canProg={canProg}
            busy={busy}
            draftOffsite={draftOffsite}
            setDraftOffsite={setDraftOffsite}
            updateRow={updateRow}
            save={save}
            createOffsite={createOffsite}
            dayInfo={dayInfo[dayKeyPrague(row.server_time)]}
          />
        ))}
        {!filteredRows.length ? <div className="rounded-lg border bg-white p-6 text-center text-sm text-slate-500 shadow-sm">Žádné záznamy k úpravě.</div> : null}
      </section>
    </AppShell>
  );
}

function EditCard({
  row,
  canProg,
  busy,
  draftOffsite,
  setDraftOffsite,
  updateRow,
  save,
  createOffsite,
  dayInfo,
}: {
  row: Row;
  canProg: boolean;
  busy: string | null;
  draftOffsite: Record<string, { reason: string; hours: string }>;
  setDraftOffsite: React.Dispatch<React.SetStateAction<Record<string, { reason: string; hours: string }>>>;
  updateRow: (id: string, patch: Partial<Row>) => void;
  save: (row: Row) => void;
  createOffsite: (row: Row) => void;
  dayInfo?: DayInfo;
}) {
  const day = dayKeyPrague(row.server_time);
  const draftKey = `${day}__${row.site_id || ""}`;
  const draft = draftOffsite[draftKey] || { reason: "", hours: "" };

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold">{row.type === "OUT" ? "Práce" : "Mimo stavbu"}</div>
          <div className="mt-1 text-xs text-slate-500">{fmtDateTimeCZFromIso(row.server_time)} · {row.site_name || "Bez stavby"}</div>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${row.is_paid ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
          {row.is_paid ? "Zaplaceno" : "Nezaplaceno"}
        </span>
      </div>

      {row.type === "OUT" ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_220px]">
          <Field label="Popis práce">
            <textarea className="mt-2 w-full rounded-lg border px-3 py-2 text-sm" rows={4} value={row.note_work || ""} onChange={(e) => updateRow(row.id, { note_work: e.target.value })} disabled={row.is_paid} />
          </Field>
          <div className="space-y-3">
            <Field label="Kilometry">
              <input className="mt-2 w-full rounded-lg border px-3 py-2 text-sm" inputMode="decimal" value={String(row.km ?? 0)} onChange={(e) => updateRow(row.id, { km: Number(onlyNumber(e.target.value)) })} disabled={row.is_paid} />
            </Field>
            <Field label="Materiál Kč">
              <input className="mt-2 w-full rounded-lg border px-3 py-2 text-sm" inputMode="decimal" value={String(row.material_amount ?? 0)} onChange={(e) => updateRow(row.id, { material_amount: Number(onlyNumber(e.target.value)) })} disabled={row.is_paid} />
            </Field>
          </div>

          {canProg ? (
            <div className="rounded-lg border bg-slate-50 p-3 lg:col-span-2">
              <div className="mb-3 grid gap-2 sm:grid-cols-3">
                <SmallInfo label="Hodiny dne" value={`${fmt(dayInfo?.hours || 0)} h`} />
                <SmallInfo label="Práce" value={`${fmt(dayInfo?.work || 0)} h`} />
                <SmallInfo label="Programování" value={`${fmt(dayInfo?.programming || 0)} h`} />
              </div>
              <div className="grid gap-3 md:grid-cols-[180px_1fr]">
                <Field label="Programování h">
                  <input className="mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm" inputMode="decimal" value={String(row.programming_hours ?? 0)} max={dayInfo?.hours || undefined} onChange={(e) => updateRow(row.id, { programming_hours: Number(onlyNumber(e.target.value)) })} disabled={row.is_paid} />
                </Field>
                <Field label="Poznámka k programování">
                  <input className="mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm" value={row.programming_note || ""} onChange={(e) => updateRow(row.id, { programming_note: e.target.value.slice(0, 500) })} disabled={row.is_paid} />
                </Field>
              </div>
            </div>
          ) : null}

          {!row.is_paid ? (
            <div className="rounded-lg border bg-blue-50/50 p-3 lg:col-span-2">
              <div className="grid gap-3 md:grid-cols-[1fr_160px_auto]">
                <Field label="Mimo stavbu">
                  <input className="mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm" value={draft.reason} onChange={(e) => setDraftOffsite((prev) => ({ ...prev, [draftKey]: { ...draft, reason: e.target.value } }))} placeholder="Nákup, sklad, administrativa" />
                </Field>
                <Field label="Hodiny">
                  <input className="mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm" inputMode="decimal" value={draft.hours} onChange={(e) => setDraftOffsite((prev) => ({ ...prev, [draftKey]: { ...draft, hours: onlyNumber(e.target.value) } }))} />
                </Field>
                <button className="self-end rounded-lg border bg-white px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-50" disabled={busy === row.id} onClick={() => createOffsite(row)}>
                  Přidat
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_180px]">
          <Field label="Popis">
            <input className="mt-2 w-full rounded-lg border px-3 py-2 text-sm" value={row.offsite_reason || ""} onChange={(e) => updateRow(row.id, { offsite_reason: e.target.value })} disabled={row.is_paid} />
          </Field>
          <Field label="Hodiny">
            <input className="mt-2 w-full rounded-lg border px-3 py-2 text-sm" inputMode="decimal" value={String(row.offsite_hours ?? 0)} onChange={(e) => updateRow(row.id, { offsite_hours: Number(onlyNumber(e.target.value)) })} disabled={row.is_paid} />
          </Field>
          <Field label="Materiál Kč">
            <input className="mt-2 w-full rounded-lg border px-3 py-2 text-sm" inputMode="decimal" value={String(row.material_amount ?? 0)} onChange={(e) => updateRow(row.id, { material_amount: Number(onlyNumber(e.target.value)) })} disabled={row.is_paid} />
          </Field>
        </div>
      )}

      <div className="mt-3">
        <Field label="Materiál popis">
          <input className="mt-2 w-full rounded-lg border px-3 py-2 text-sm" value={row.material_desc || ""} onChange={(e) => updateRow(row.id, { material_desc: e.target.value })} disabled={row.is_paid} />
        </Field>
      </div>

      {!row.is_paid ? (
        <div className="mt-4 flex justify-end">
          <button onClick={() => save(row)} disabled={busy === row.id} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy === row.id ? "Ukládám" : "Uložit změny"}
          </button>
        </div>
      ) : null}
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-slate-600">{label}{children}</label>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">{label}</div><div className="mt-2 text-2xl font-semibold">{value}</div></div>;
}

function SmallInfo({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-white p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-semibold">{value}</div></div>;
}
