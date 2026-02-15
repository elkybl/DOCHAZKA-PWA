"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type PendingSite = {
  id: string;
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  radius_m?: number | null;
  created_at?: string;
  created_by_name?: string | null;
};

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export default function PendingSitesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<PendingSite[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setErr(null);
    setInfo(null);

    const t = getToken();
    if (!t) {
      router.push("/login");
      return;
    }

    // ⚠️ Pozn.: pokud máš endpoint jiný, uprav URL tady:
    const res = await fetch("/api/admin/pending-sites", {
      headers: { authorization: `Bearer ${t}` },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data?.error || "Chyba při načítání dočasných staveb.");
      setRows([]);
      return;
    }

    setRows(data.rows || []);
  }

  // schválení – uprav URL, pokud to máš jinde
  async function approve(id: string) {
    setErr(null);
    setInfo(null);

    const t = getToken();
    if (!t) return router.push("/login");

    setBusy(id);
    try {
      const res = await fetch(`/api/admin/pending-sites/${id}/approve`, {
        method: "POST",
        headers: { authorization: `Bearer ${t}` },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nešlo schválit.");

      setInfo("Schváleno. Nezapomeň zkontrolovat GPS/radius.");
      await load();
    } catch (e: any) {
      setErr(e.message || "Chyba");
    } finally {
      setBusy(null);
    }
  }

  // ✅ zamítnout – volá nový endpoint
  async function reject(id: string) {
    setErr(null);
    setInfo(null);

    const t = getToken();
    if (!t) return router.push("/login");

    const ok = window.confirm(
      "Zamítnout dočasnou stavbu?\n\nDocházkové záznamy z této stavby se nepomažou – přesunou se do Nezařazeno a v textu se označí, že byly z zamítnuté akce."
    );
    if (!ok) return;

    setBusy(id);
    try {
      const res = await fetch(`/api/admin/sites/${id}/reject`, {
        method: "POST",
        headers: { authorization: `Bearer ${t}` },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nešlo zamítnout.");

      setInfo(
        data?.message ||
          "Zamítnuto. Záznamy byly přesunuty do Nezařazeno."
      );
      await load();
    } catch (e: any) {
      setErr(e.message || "Chyba");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.push("/login");
      return;
    }
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="space-y-4 px-3">
      <div className="rounded-3xl border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Dočasné stavby</div>
            <div className="mt-1 text-xs text-neutral-600">
              Tady uvidíš akce založené z terénu. Schválíš je, nebo zamítneš (a záznamy přesuneš do Nezařazeno).
            </div>

            <Link className="mt-2 inline-block text-xs text-neutral-600 underline" href="/admin">
              Zpět do Admin
            </Link>
          </div>

          <button
            onClick={load}
            className="rounded-2xl border bg-white px-4 py-2 text-sm shadow-sm"
          >
            Obnovit
          </button>
        </div>

        {err && <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{err}</div>}
        {info && <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">{info}</div>}
      </div>

      <div className="space-y-3">
        {rows.map((s) => (
          <div key={s.id} className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold">{s.name}</div>
                <div className="mt-1 text-xs text-neutral-600">
                  {s.address || "—"}{" "}
                  {s.radius_m ? `• radius ${s.radius_m} m` : ""}
                </div>
                <div className="mt-1 text-[11px] text-neutral-500">
                  {s.created_at ? `Vytvořeno: ${s.created_at.slice(0, 16).replace("T", " ")}` : ""}
                  {s.created_by_name ? ` • od: ${s.created_by_name}` : ""}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => approve(s.id)}
                  disabled={busy === s.id}
                  className="rounded-2xl bg-black px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                >
                  {busy === s.id ? "…" : "Schválit"}
                </button>

                <button
                  onClick={() => reject(s.id)}
                  disabled={busy === s.id}
                  className="rounded-2xl border bg-white px-4 py-2 text-sm shadow-sm disabled:opacity-50"
                >
                  {busy === s.id ? "…" : "Zamítnout"}
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border bg-neutral-50 p-4 text-xs text-neutral-700">
              Schválení: stavba se stane normální a bude se kontrolovat GPS radius. Zamítnutí: docházka se
              nepomaže – přesune se do Nezařazeno a označí se v textu.
            </div>
          </div>
        ))}

        {rows.length === 0 && (
          <div className="rounded-3xl border bg-white p-6 text-sm text-neutral-600 shadow-sm">
            Zatím žádné dočasné stavby.
          </div>
        )}
      </div>
    </main>
  );
}
