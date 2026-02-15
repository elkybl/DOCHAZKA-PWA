"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Site = {
  id: string;
  name: string;
  address?: string | null;
  lat: number;
  lng: number;
  radius_m: number;
  is_active: boolean;
};

function token() {
  return localStorage.getItem("token");
}

export default function AdminSites() {
  const [sites, setSites] = useState<Site[]>([]);
  const [form, setForm] = useState<any>({
    name: "",
    address: "",
    lat: "",
    lng: "",
    radius_m: 250,
    is_active: true,
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setErr(null);
    const t = token();
    if (!t) {
      setErr("Chybí přihlášení.");
      return;
    }

    const res = await fetch("/api/admin/sites", {
      headers: { authorization: `Bearer ${t}` },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data?.error || "Chyba");
      return;
    }

    setSites(data.sites || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    setErr(null);
    setMsg(null);

    const t = token();
    if (!t) {
      setErr("Chybí přihlášení.");
      return;
    }

    const payload = {
      ...form,
      lat: Number(form.lat),
      lng: Number(form.lng),
      radius_m: Number(form.radius_m),
      address: form.address || null,
      is_active: !!form.is_active,
      ...(editingId ? { id: editingId } : {}),
    };

    const res = await fetch("/api/admin/sites", {
      method: editingId ? "PATCH" : "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${t}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data?.error || "Nešlo uložit.");
      return;
    }

    setMsg("Uloženo.");
    setEditingId(null);
    setForm({ name: "", address: "", lat: "", lng: "", radius_m: 250, is_active: true });
    await load();
  }

  function edit(s: Site) {
    setEditingId(s.id);
    setForm({
      name: s.name,
      address: s.address ?? "",
      lat: String(s.lat),
      lng: String(s.lng),
      radius_m: s.radius_m,
      is_active: s.is_active,
    });
    setMsg(null);
    setErr(null);
  }

  function resetForm() {
    setEditingId(null);
    setForm({ name: "", address: "", lat: "", lng: "", radius_m: 250, is_active: true });
    setMsg(null);
    setErr(null);
  }

  async function removeSite(id: string, name: string) {
    const ok = confirm(
      `Smazat stavbu "${name}"? Pokud má navázané záznamy docházky, nepůjde to (doporučeno deaktivovat).`
    );
    if (!ok) return;

    const t = token();
    if (!t) {
      setErr("Chybí přihlášení.");
      return;
    }

    setDeletingId(id);
    setErr(null);
    setMsg(null);

    try {
      const res = await fetch(`/api/admin/sites/${id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${t}` },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Smazání selhalo.");

      setSites((prev) => prev.filter((s) => s.id !== id));
    } catch (e: any) {
      setErr(e.message || "Smazání selhalo.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="space-y-4">
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Stavby</h1>
            <Link className="mt-2 inline-block text-xs text-neutral-600 underline" href="/admin">
              Zpět do Admin menu
            </Link>
          </div>

          {editingId && (
            <button className="rounded-xl border px-3 py-2 text-sm" onClick={resetForm}>
              Zrušit edit
            </button>
          )}
        </div>

        <div className="mt-4 grid gap-2">
          <input
            className="rounded-xl border px-3 py-2"
            placeholder="Název"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />

          <input
            className="rounded-xl border px-3 py-2"
            placeholder="Adresa (volitelné)"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-2">
            <input
              className="rounded-xl border px-3 py-2"
              placeholder="lat"
              value={form.lat}
              onChange={(e) => setForm({ ...form, lat: e.target.value })}
            />
            <input
              className="rounded-xl border px-3 py-2"
              placeholder="lng"
              value={form.lng}
              onChange={(e) => setForm({ ...form, lng: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 items-center gap-2">
            <input
              className="rounded-xl border px-3 py-2"
              placeholder="radius m"
              value={form.radius_m}
              onChange={(e) => setForm({ ...form, radius_m: e.target.value })}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              aktivní
            </label>
          </div>

          <button className="rounded-xl bg-black px-4 py-3 text-white" onClick={save}>
            {editingId ? "Uložit změny" : "Přidat stavbu"}
          </button>

          {err && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</div>}
          {msg && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{msg}</div>}
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-neutral-700">Seznam</h2>

        <div className="mt-3 space-y-2">
          {sites.map((s) => (
            <div key={s.id} className="rounded-xl border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-neutral-600">
                    {s.lat}, {s.lng} • {s.radius_m} m • {s.is_active ? "aktivní" : "neaktivní"}
                  </div>
                  {s.address && <div className="text-xs text-neutral-500">{s.address}</div>}
                </div>

                <div className="flex gap-2">
                  <button className="rounded-xl border px-3 py-2 text-sm" onClick={() => edit(s)}>
                    Edit
                  </button>

                  <button
                    className="rounded-xl border px-3 py-2 text-sm disabled:opacity-50"
                    onClick={() => removeSite(s.id, s.name)}
                    disabled={deletingId === s.id}
                    title="Smazat stavbu"
                  >
                    {deletingId === s.id ? "Mažu…" : "Smazat"}
                  </button>
                </div>
              </div>
            </div>
          ))}

          {sites.length === 0 && (
            <div className="rounded-xl border bg-neutral-50 p-4 text-sm text-neutral-600">
              Zatím žádné stavby.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
