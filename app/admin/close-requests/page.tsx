"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Row = {
  id: string;
  user_id: string;
  user_name: string;
  site_id: string | null;
  site_name: string | null;
  in_time: string;
  requested_at: string;

  reported_left_at: string | null;
  forget_reason: string | null;
  note_work: string | null;
  km: number | null;
  material_desc: string | null;
  material_amount: number | null;
  status: "pending" | "approved" | "rejected";
};

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export default function CloseRequestsAdminPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // admin override času odchodu per row
  const [outTimeOverride, setOutTimeOverride] = useState<Record<string, string>>({});

  function setDefaultOverrides(list: Row[]) {
    setOutTimeOverride((prev) => {
      const next = { ...prev };
      for (const r of list) {
        if (next[r.id] == null) next[r.id] = (r.reported_left_at || "").trim();
      }
      return next;
    });
  }

  async function load() {
    setErr(null);
    setInfo(null);

    const t = getToken();
    if (!t) {
      router.push("/login");
      return;
    }

    const res = await fetch("/api/admin/close-requests", {
      headers: { authorization: `Bearer ${t}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data?.error || "Chyba při načítání.");
      return;
    }

    const list = (data.rows || []) as Row[];
    setRows(list);
    setDefaultOverrides(list);
  }

  async function approve(id: string) {
    setErr(null);
    setInfo(null);

    const t = getToken();
    if (!t) return;

    const out_time = (outTimeOverride[id] || "").trim();
    if (!out_time) {
      setErr("Doplň čas odchodu (např. 16:50) – můžeš ho upravit.");
      return;
    }

    setBusy(id);
    try {
      const res = await fetch(`/api/admin/close-requests/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
        body: JSON.stringify({ out_time }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nešlo schválit.");

      setInfo(`Schváleno. OUT uložen na ${data?.out_time ? String(data.out_time).slice(0, 16).replace("T", " ") : out_time}.`);
      await load();
    } catch (e: any) {
      setErr(e.message || "Chyba");
    } finally {
      setBusy(null);
    }
  }

  async function reject(id: string) {
    setErr(null);
    setInfo(null);
    const t = getToken();
    if (!t) return;

    setBusy(id);
    try {
      const res = await fetch(`/api/admin/close-requests/${id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${t}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nešlo zamítnout.");
      setInfo("Zamítnuto.");
      await load();
    } catch (e: any) {
      setErr(e.message || "Chyba");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="space-y-4">
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Žádosti o ukončení směny</h1>
            <p className="mt-1 text-xs text-neutral-500">
              Zaměstnanec pošle žádost, protože je mimo stavbu / zapomněl odchod. Ty vyplníš nebo upravíš čas odchodu a schválíš.
              Tím se vytvoří OUT do databáze s tímto časem.
            </p>
            <Link className="mt-2 inline-block text-xs text-neutral-600 underline" href="/admin">
              Zpět do adminu
            </Link>
          </div>

          <button className="rounded-xl border px-3 py-2 text-sm" onClick={load}>
            Obnovit
          </button>
        </div>

        {err && <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</div>}
        {info && <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div>}
      </div>

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">
                  {r.user_name} • {r.site_name || "—"}
                </div>
                <div className="mt-1 text-xs text-neutral-600">
                  Příchod: {r.in_time.slice(0, 16).replace("T", " ")} • Žádost:{" "}
                  {r.requested_at.slice(0, 16).replace("T", " ")}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => approve(r.id)}
                  disabled={busy === r.id}
                  className="rounded-xl bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                  {busy === r.id ? "…" : "Schválit"}
                </button>
                <button
                  onClick={() => reject(r.id)}
                  disabled={busy === r.id}
                  className="rounded-xl border bg-white px-4 py-2 text-sm disabled:opacity-50"
                >
                  Zamítnout
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border bg-neutral-50 p-3">
                <div className="text-xs font-semibold text-neutral-700">Čas odchodu (admin může upravit)</div>
                <div className="mt-2 flex gap-2">
                  <input
                    className="w-full rounded-xl border bg-white px-3 py-2 text-sm"
                    value={outTimeOverride[r.id] ?? ""}
                    onChange={(e) =>
                      setOutTimeOverride((p) => ({ ...p, [r.id]: e.target.value.slice(0, 50) }))
                    }
                    placeholder="např. 16:50"
                  />
                </div>
                <div className="mt-2 text-[11px] text-neutral-600">
                  Můžeš zadat 16:50 (vezme se datum z příchodu) nebo celý datum/čas. Systém nedovolí čas před příchodem ani do budoucna.
                </div>

                <div className="mt-3 text-xs font-semibold text-neutral-700">Proč zapomněl ukončit</div>
                <div className="mt-1 text-sm text-neutral-800 whitespace-pre-wrap">{r.forget_reason || "—"}</div>
              </div>

              <div className="rounded-xl border bg-neutral-50 p-3">
                <div className="text-xs font-semibold text-neutral-700">Co se dělalo</div>
                <div className="mt-1 text-sm text-neutral-800 whitespace-pre-wrap">{r.note_work || "—"}</div>

                <div className="mt-3 text-xs text-neutral-700">
                  Km: <span className="text-neutral-900">{r.km ?? 0}</span>
                </div>
                <div className="mt-1 text-xs text-neutral-700">
                  Materiál: <span className="text-neutral-900">{r.material_desc || "—"}</span> •{" "}
                  <span className="text-neutral-900">{r.material_amount ?? 0} Kč</span>
                </div>

                <div className="mt-3 text-[11px] text-neutral-600">
                  Původně zadaný čas zaměstnance: <span className="text-neutral-900">{r.reported_left_at || "—"}</span>
                </div>
              </div>
            </div>
          </div>
        ))}

        {rows.length === 0 && (
          <div className="rounded-2xl border bg-white p-5 text-sm text-neutral-600 shadow-sm">
            Zatím žádné čekající žádosti.
          </div>
        )}
      </div>
    </main>
  );
}
