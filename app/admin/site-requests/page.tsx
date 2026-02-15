"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Row = {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  radius_m: number;
  is_pending: boolean;
  created_by: string | null;
  created_by_name: string;
  created_at: string;
};

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

function numStr(v: any, maxLen: number) {
  return String(v ?? "").replace(/[^\d.-]/g, "").slice(0, maxLen);
}

export default function SiteRequestsAdminPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [radius, setRadius] = useState<Record<string, string>>({});
  const [nameEdit, setNameEdit] = useState<Record<string, string>>({});
  const [addrEdit, setAddrEdit] = useState<Record<string, string>>({});
  const [latEdit, setLatEdit] = useState<Record<string, string>>({});
  const [lngEdit, setLngEdit] = useState<Record<string, string>>({});

  async function load() {
    setErr(null);
    setInfo(null);

    const t = getToken();
    if (!t) return router.push("/login");

    const res = await fetch("/api/admin/site-requests", {
      headers: { authorization: `Bearer ${t}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data?.error || "Chyba");
      return;
    }

    const list = (data.rows || []) as Row[];
    setRows(list);

    setRadius((prev) => {
      const next = { ...prev };
      for (const r of list) if (next[r.id] == null) next[r.id] = String(r.radius_m ?? 200);
      return next;
    });
    setNameEdit((prev) => {
      const next = { ...prev };
      for (const r of list) if (next[r.id] == null) next[r.id] = r.name || "";
      return next;
    });
    setAddrEdit((prev) => {
      const next = { ...prev };
      for (const r of list) if (next[r.id] == null) next[r.id] = r.address || "";
      return next;
    });
    setLatEdit((prev) => {
      const next = { ...prev };
      for (const r of list) if (next[r.id] == null) next[r.id] = String(r.lat);
      return next;
    });
    setLngEdit((prev) => {
      const next = { ...prev };
      for (const r of list) if (next[r.id] == null) next[r.id] = String(r.lng);
      return next;
    });
  }

  async function activate(id: string) {
    setErr(null);
    setInfo(null);

    const t = getToken();
    if (!t) return;

    const r = Number((radius[id] || "").replace(/[^\d]/g, ""));
    if (!r || r < 50) return setErr("Radius musí být aspoň 50 m.");

    const lat = Number(latEdit[id]);
    const lng = Number(lngEdit[id]);
    if (Number.isNaN(lat) || lat < -90 || lat > 90) return setErr("Lat je neplatná.");
    if (Number.isNaN(lng) || lng < -180 || lng > 180) return setErr("Lng je neplatná.");

    setBusy(id);
    try {
      const res = await fetch(`/api/admin/site-requests/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
        body: JSON.stringify({
          radius_m: r,
          name: (nameEdit[id] || "").trim() || undefined,
          address: (addrEdit[id] || "").trim() || undefined,
          lat,
          lng,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nešlo aktivovat.");

      setInfo("Stavba aktivována (už není dočasná).");
      await load();
    } catch (e: any) {
      setErr(e.message || "Chyba");
    } finally {
      setBusy(null);
    }
  }

  async function archive(id: string) {
    setErr(null);
    setInfo(null);

    const t = getToken();
    if (!t) return;

    if (!confirm("Archivovat dočasnou stavbu? (zmizí z výběru, historie zůstane)")) return;

    setBusy(id);
    try {
      const res = await fetch(`/api/admin/site-requests/${id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${t}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nešlo archivovat.");
      setInfo("Archivováno.");
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

  const count = useMemo(() => rows.length, [rows.length]);

  return (
    <main className="space-y-4 px-3">
      <div className="rounded-3xl border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Dočasné stavby</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Zaměstnanec založí akci z telefonu (GPS). Tady ji upravíš (název, adresa, GPS, radius) a aktivuješ.
            </p>
            <div className="mt-2 text-xs text-neutral-500">Čeká: {count}</div>

            <Link className="mt-2 inline-block text-xs text-neutral-600 underline" href="/admin">
              Zpět do adminu
            </Link>
          </div>

          <button className="rounded-xl border bg-white px-4 py-2 text-sm shadow-sm" onClick={load}>
            Obnovit
          </button>
        </div>

        {err && <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{err}</div>}
        {info && <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">{info}</div>}
      </div>

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-neutral-900">{r.name}</div>
                <div className="mt-1 text-xs text-neutral-600">
                  Založil: {r.created_by_name} • {String(r.created_at || "").slice(0, 16).replace("T", " ")}
                </div>
                <div className="mt-1 text-xs text-neutral-600">
                  Mapy:{" "}
                  <a
                    className="underline"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://www.google.com/maps?q=${r.lat},${r.lng}`}
                  >
                    otevřít bod
                  </a>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-xl bg-black px-4 py-2 text-sm text-white shadow-sm disabled:opacity-50"
                  onClick={() => activate(r.id)}
                  disabled={busy === r.id}
                >
                  {busy === r.id ? "…" : "Aktivovat"}
                </button>
                <button
                  className="rounded-xl border bg-white px-4 py-2 text-sm shadow-sm disabled:opacity-50"
                  onClick={() => archive(r.id)}
                  disabled={busy === r.id}
                >
                  Archivovat
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border bg-neutral-50 p-4">
                <div className="text-xs font-semibold text-neutral-700">Název</div>
                <input
                  className="mt-2 w-full rounded-xl border bg-white px-3 py-2 text-sm"
                  value={nameEdit[r.id] ?? ""}
                  onChange={(e) => setNameEdit((p) => ({ ...p, [r.id]: e.target.value.slice(0, 120) }))}
                />

                <div className="mt-4 text-xs font-semibold text-neutral-700">Adresa / poznámka</div>
                <input
                  className="mt-2 w-full rounded-xl border bg-white px-3 py-2 text-sm"
                  value={addrEdit[r.id] ?? ""}
                  onChange={(e) => setAddrEdit((p) => ({ ...p, [r.id]: e.target.value.slice(0, 180) }))}
                />
              </div>

              <div className="rounded-2xl border bg-neutral-50 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold text-neutral-700">Lat</div>
                    <input
                      className="mt-2 w-full rounded-xl border bg-white px-3 py-2 text-sm"
                      value={latEdit[r.id] ?? ""}
                      onChange={(e) => setLatEdit((p) => ({ ...p, [r.id]: numStr(e.target.value, 20) }))}
                    />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-neutral-700">Lng</div>
                    <input
                      className="mt-2 w-full rounded-xl border bg-white px-3 py-2 text-sm"
                      value={lngEdit[r.id] ?? ""}
                      onChange={(e) => setLngEdit((p) => ({ ...p, [r.id]: numStr(e.target.value, 20) }))}
                    />
                  </div>
                </div>

                <div className="mt-4 text-xs font-semibold text-neutral-700">Radius (m)</div>
                <input
                  className="mt-2 w-full rounded-xl border bg-white px-3 py-2 text-sm"
                  inputMode="numeric"
                  value={radius[r.id] ?? ""}
                  onChange={(e) =>
                    setRadius((p) => ({ ...p, [r.id]: e.target.value.replace(/[^\d]/g, "").slice(0, 4) }))
                  }
                  placeholder="200"
                />
                <div className="mt-2 text-[11px] text-neutral-600">Doporučení: 100–300 m.</div>
              </div>
            </div>
          </div>
        ))}

        {rows.length === 0 && (
          <div className="rounded-3xl border bg-white p-6 text-sm text-neutral-600 shadow-sm">
            Žádné dočasné stavby.
          </div>
        )}
      </div>
    </main>
  );
}
