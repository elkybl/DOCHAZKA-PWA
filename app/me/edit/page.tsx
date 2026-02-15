"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Row = {
  id: string;
  type: "OUT" | "OFFSITE";
  server_time: string;
  site_name: string | null;
  note_work: string;
  km: number;
  offsite_reason: string;
  offsite_hours: number;
  material_desc: string;
  material_amount: number;
  is_paid: boolean;
};

export default function Page() {
  const [token, setToken] = useState<string | null>(null);

  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // ✅ localStorage až v useEffect
  useEffect(() => {
    const t = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    setToken(t);
  }, []);

  async function load(t: string) {
    setErr(null);
    setInfo(null);

    const res = await fetch("/api/me/events?days=14", {
      headers: { authorization: `Bearer ${t}` },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data?.error || "Chyba");
      return;
    }
    setRows(data.rows || []);
  }

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
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
      await load(token);
    } catch (e: any) {
      setErr(e.message || "Chyba");
    } finally {
      setBusy(null);
    }
  }

  // ✅ načíst až když token existuje
  useEffect(() => {
    if (!token) return;
    load(token);
  }, [token]);

  return (
    <main className="space-y-4">
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Opravit záznamy</h1>
            <p className="mt-1 text-xs text-neutral-500">
              Upravíš jen texty/částky (práce, km, materiál, mimo stavbu). Čas a poloha nejdou.
            </p>
            <Link className="mt-2 inline-block text-xs text-neutral-600 underline" href="/me">
              Zpět na Moje výdělek
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
                  {r.type === "OUT" ? "Odchod" : "Mimo stavbu"} •{" "}
                  {r.server_time.slice(0, 16).replace("T", " ")}
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
                  onChange={(e) =>
                    updateRow(r.id, { km: Number(e.target.value.replace(/[^\d.]/g, "")) })
                  }
                  disabled={r.is_paid}
                />
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
                  onChange={(e) =>
                    updateRow(r.id, { offsite_hours: Number(e.target.value.replace(/[^\d.]/g, "")) })
                  }
                  disabled={r.is_paid}
                />
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
                onChange={(e) =>
                  updateRow(r.id, { material_amount: Number(e.target.value.replace(/[^\d.]/g, "")) })
                }
                disabled={r.is_paid}
              />
            </div>

            {!r.is_paid && (
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
