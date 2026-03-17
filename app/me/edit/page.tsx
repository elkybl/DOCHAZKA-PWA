"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmtDateTimeCZFromIso } from "@/lib/time";

type Row = {
  id: string;
  type: "OUT" | "OFFSITE";
  server_time: string;
  site_id: string | null;
  site_name: string | null;

  // OUT
  note_work: string;
  km: number;
  programming_hours: number;
  programming_note: string;

  // OFFSITE
  offsite_reason: string;
  offsite_hours: number;

  // shared
  material_desc: string;
  material_amount: number;
  is_paid: boolean;
};

export default function Page() {
  const [token, setToken] = useState<string | null>(null);
  const [canProg, setCanProg] = useState(false);

  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // for days where OFFSITE doesn't exist yet (key: day__siteId)
  const [newOffsite, setNewOffsite] = useState<Record<string, { reason: string; hours: string }>>({});

  useEffect(() => {
    const t = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    setToken(t);
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch("/api/me/profile", { headers: { authorization: `Bearer ${token}` } })
      .then((r) => r.json().catch(() => ({})))
      .then((d) => setCanProg(!!d?.user?.is_programmer))
      .catch(() => setCanProg(false));
  }, [token]);

  async function load(t: string) {
    setErr(null);
    setInfo(null);

    const res = await fetch("/api/me/events?days=60", {
      headers: { authorization: `Bearer ${t}` },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data?.error || "Chyba");
      return;
    }
    setRows((data.rows || []) as Row[]);
  }

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

function dayKeyPrague(iso: string) {
    const d = new Date(iso);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Prague",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const obj: any = {};
    for (const p of parts) obj[p.type] = p.value;
    return `${obj.year}-${obj.month}-${obj.day}`;
  }

  function setNewOffsiteField(key: string, patch: Partial<{ reason: string; hours: string }>) {
    setNewOffsite((prev) => ({
      ...prev,
      [key]: { reason: prev[key]?.reason ?? "", hours: prev[key]?.hours ?? "", ...patch },
    }));
  }

  async function createOffsiteForDay(opts: { day: string; site_id: string | null; reason: string; hours: number }) {
    if (!token) {
      setErr("Nejsi přihlášen.");
      return;
    }
    setErr(null);
    setInfo(null);
    const res = await fetch("/api/attendance/offsite", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        day_local: opts.day,
        site_id: opts.site_id,
        offsite_reason: opts.reason,
        offsite_hours: opts.hours,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Nešlo uložit mimo stavbu.");
  }

  async function save(r: Row) {
    setErr(null);
    setInfo(null);

    if (!token) {
      setErr("Nejsi přihlášen.");
      return;
    }
    if (r.is_paid) {
      setErr("Zaplacené záznamy nejdou upravit.");
      return;
    }

    setBusy(r.id);
    try {
      const payload: any = { id: r.id };

      if (r.type === "OUT") {
        payload.note_work = r.note_work;
        payload.km = Number(r.km || 0);

        if (canProg) {
          payload.programming_hours = Number(r.programming_hours || 0);
          payload.programming_note = r.programming_note || "";
        }
      } else {
        payload.offsite_reason = r.offsite_reason;
        payload.offsite_hours = Number(r.offsite_hours || 0);
      }

      payload.material_desc = r.material_desc;
      payload.material_amount = Number(r.material_amount || 0);

      const res = await fetch("/api/attendance/edit", {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nešlo uložit.");

      setInfo("Uloženo.");
      await load(token!);
    } catch (e: any) {
      setErr(e.message || "Chyba");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!token) return;
    load(token);
  }, [token]);

  return (
    <main className="space-y-4">
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Doplnit práci</h1>
            <p className="mt-1 text-xs text-neutral-500">
              Upravíš jen texty/částky (práce, km, materiál, mimo stavbu). Čas a poloha nejdou.
            </p>
            <Link className="mt-2 inline-block text-xs text-neutral-600 underline" href="/me">
              Zpět na Moje výdělky
            </Link>
          </div>
          <button
            className="rounded-xl border px-3 py-2 text-sm"
            onClick={() => token && load(token)}
            disabled={!token}
          >
            Obnovit
          </button>
        </div>

        {!token && (
          <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            Nejsem přihlášen (nebo se stránka ještě načítá). Otevři /login.
          </div>
        )}

        {err && <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</div>}
        {info && <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div>}
      </div>

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">
                  {r.type === "OUT" ? "Odchod" : "Mimo stavbu"} • {fmtDateTimeCZFromIso(r.server_time)}
                </div>
                <div className="mt-1 text-xs text-neutral-600">Stavba: {r.site_name || "—"}</div>
              </div>

              <div
                className={`rounded-full px-3 py-1 text-xs ${
                  r.is_paid ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
                }`}
              >
                {r.is_paid ? "Zaplaceno" : "Nezaplaceno"}
              </div>
            </div>

            {r.type === "OUT" ? (
              <>
                <label className="mt-3 block text-sm text-neutral-700">Co se dělalo</label>
                <textarea
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                  rows={3}
                  value={r.note_work}
                  onChange={(e) => updateRow(r.id, { note_work: e.target.value })}
                  disabled={r.is_paid}
                />

                <label className="mt-3 block text-sm text-neutral-700">Km</label>
                <input
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                  inputMode="decimal"
                  value={String(r.km ?? 0)}
                  onChange={(e) => updateRow(r.id, { km: Number(e.target.value.replace(/[^\d.]/g, "")) })}
                  disabled={r.is_paid}
                />

                {canProg && (
                  <div className="mt-4 rounded-2xl border bg-neutral-50 p-4">
                    <div className="text-sm font-semibold">Programování</div>
                    <p className="mt-1 text-xs text-neutral-500">
                      Pokud jsi dnes programoval, zadej počet hodin. Zbytek dne zůstane jako práce na stavbě.
                    </p>

                    <label className="mt-3 block text-sm text-neutral-700">Hodiny programování</label>
                    <input
                      className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                      inputMode="decimal"
                      value={String(r.programming_hours ?? 0)}
                      onChange={(e) =>
                        updateRow(r.id, { programming_hours: Number(e.target.value.replace(/[^\d.]/g, "")) })
                      }
                      disabled={r.is_paid}
                    />

                    <label className="mt-3 block text-sm text-neutral-700">Poznámka k programování</label>
                    <input
                      className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                      value={r.programming_note}
                      onChange={(e) => updateRow(r.id, { programming_note: e.target.value.slice(0, 500) })}
                      disabled={r.is_paid}
                      placeholder="např. Loxone, Home Assistant…"
                    />
                  </div>
                )}
                {/* OFFSITE for the same day + site */}
                {(() => {
                  const day = dayKeyPrague(r.server_time);
                  const key = `${day}__${r.site_id || ""}`;

                  const existing =
                    rows.find(
                      (x) =>
                        x.type === "OFFSITE" &&
                        dayKeyPrague(x.server_time) === day &&
                        ((r.site_id && x.site_id === r.site_id) || (!r.site_id && !x.site_id))
                    ) || rows.find((x) => x.type === "OFFSITE" && dayKeyPrague(x.server_time) === day);

                  const draft = newOffsite[key] || { reason: "", hours: "" };
                  const isPaid = r.is_paid;

                  return (
                    <div className="mt-4 rounded-2xl border bg-neutral-50 p-4">
                      <div className="text-sm font-semibold">Mimo stavbu (nákup / sklad / vyřízení)</div>
                      <p className="mt-1 text-xs text-neutral-500">
                        Přidá se k tomuto dni. Piš sem i „co se dělalo“ mimo stavbu (např. nákup kabelů, vyzvednutí
                        materiálu).
                      </p>

                      {existing ? (
                        <>
                          <label className="mt-3 block text-sm text-neutral-700">Důvod / co se dělalo</label>
                          <input
                            className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                            value={existing.offsite_reason}
                            onChange={(e) => updateRow(existing.id, { offsite_reason: e.target.value })}
                            disabled={existing.is_paid}
                          />

                          <label className="mt-3 block text-sm text-neutral-700">Hodiny</label>
                          <input
                            className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                            inputMode="decimal"
                            value={String(existing.offsite_hours ?? 0)}
                            onChange={(e) =>
                              updateRow(existing.id, {
                                offsite_hours: Number(e.target.value.replace(/[^\d.]/g, "")),
                              })
                            }
                            disabled={existing.is_paid}
                          />

                          {!existing.is_paid && (
                            <button
                              className="mt-3 w-full rounded-xl bg-black px-4 py-2 text-white disabled:opacity-50"
                              onClick={() => save(existing)}
                              disabled={busy === existing.id}
                            >
                              {busy === existing.id ? "Ukládám…" : "Uložit mimo stavbu"}
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <label className="mt-3 block text-sm text-neutral-700">Důvod / co se dělalo</label>
                          <input
                            className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                            value={draft.reason}
                            onChange={(e) => setNewOffsiteField(key, { reason: e.target.value })}
                            disabled={isPaid}
                            placeholder="např. nákup materiálu, sklad…"
                          />

                          <label className="mt-3 block text-sm text-neutral-700">Hodiny</label>
                          <input
                            className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                            inputMode="decimal"
                            value={draft.hours}
                            onChange={(e) => setNewOffsiteField(key, { hours: e.target.value.replace(/[^\d.]/g, "") })}
                            disabled={isPaid}
                            placeholder="např. 2"
                          />

                          {!isPaid && (
                            <button
                              className="mt-3 w-full rounded-xl bg-black px-4 py-2 text-white disabled:opacity-50"
                              disabled={busy === r.id}
                              onClick={async () => {
                                try {
                                  setBusy(r.id);
                                  const hours = Number(draft.hours || 0);
                                  if (!draft.reason.trim()) throw new Error("Doplň důvod mimo stavbu.");
                                  if (!Number.isFinite(hours) || hours <= 0) throw new Error("Doplň počet hodin (např. 2).");
                                  await createOffsiteForDay({
                                    day,
                                    site_id: r.site_id || null,
                                    reason: draft.reason.trim(),
                                    hours,
                                  });
                                  setInfo("Mimo stavbu uloženo.");
                                  await load(token!);
                                } catch (e: any) {
                                  setErr(e.message || "Chyba");
                                } finally {
                                  setBusy(null);
                                }
                              }}
                            >
                              Přidat mimo stavbu
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}
              </>
            ) : (
              <>
                <label className="mt-3 block text-sm text-neutral-700">Důvod</label>
                <input
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                  value={r.offsite_reason}
                  onChange={(e) => updateRow(r.id, { offsite_reason: e.target.value })}
                  disabled={r.is_paid}
                />

                <label className="mt-3 block text-sm text-neutral-700">Hodiny</label>
                <input
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                  inputMode="decimal"
                  value={String(r.offsite_hours ?? 0)}
                  onChange={(e) => updateRow(r.id, { offsite_hours: Number(e.target.value.replace(/[^\d.]/g, "")) })}
                  disabled={r.is_paid}
                />

                {!r.is_paid && (
                  <button
                    className="mt-4 w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-50"
                    onClick={() => save(r)}
                    disabled={busy === r.id}
                  >
                    {busy === r.id ? "Ukládám…" : "Uložit mimo stavbu"}
                  </button>
                )}
              </>
            )}

            <div className="mt-4 rounded-2xl border bg-neutral-50 p-3">
              <div className="text-sm font-medium text-neutral-700">Materiál ze svého</div>

              <label className="mt-2 block text-sm text-neutral-700">Popis</label>
              <input
                className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                value={r.material_desc}
                onChange={(e) => updateRow(r.id, { material_desc: e.target.value })}
                disabled={r.is_paid}
              />

              <label className="mt-2 block text-sm text-neutral-700">Částka (Kč)</label>
              <input
                className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                inputMode="decimal"
                value={String(r.material_amount ?? 0)}
                onChange={(e) => updateRow(r.id, { material_amount: Number(e.target.value.replace(/[^\d.]/g, "")) })}
                disabled={r.is_paid}
              />
            </div>

            {r.type === "OUT" && !r.is_paid && (
              <button
                className="mt-4 w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-50"
                onClick={() => save(r)}
                disabled={busy === r.id}
              >
                {busy === r.id ? "Ukládám…" : "Uložit změny"}
              </button>
            )}
          </div>
        ))}

        {rows.length === 0 && (
          <div className="rounded-2xl border bg-white p-5 text-sm text-neutral-600 shadow-sm">
            Zatím žádné záznamy k úpravě.
          </div>
        )}
      </div>
    </main>
  );
}