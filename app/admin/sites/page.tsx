"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppNav";

type Site = {
  id: string;
  name: string;
  address?: string | null;
  lat: number;
  lng: number;
  radius_m: number;
  is_active: boolean;
};

type SiteForm = {
  name: string;
  address: string;
  lat: string;
  lng: string;
  radius_m: number | string;
  is_active: boolean;
};

function token() {
  return localStorage.getItem("token");
}

function emptyForm(): SiteForm {
  return {
    name: "",
    address: "",
    lat: "",
    lng: "",
    radius_m: 250,
    is_active: true,
  };
}

export default function AdminSites() {
  const [sites, setSites] = useState<Site[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<SiteForm>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setErr(null);
    const t = token();
    if (!t) {
      setErr("Chybi prihlaseni.");
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
      setErr("Chybi prihlaseni.");
      return;
    }

    const payload = {
      ...form,
      name: form.name.trim(),
      lat: Number(form.lat),
      lng: Number(form.lng),
      radius_m: Number(form.radius_m),
      address: form.address.trim() || null,
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
      setErr(data?.error || "Neslo ulozit.");
      return;
    }

    setMsg(editingId ? "Stavba upravena." : "Stavba pridana.");
    setEditingId(null);
    setForm(emptyForm());
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
    setForm(emptyForm());
    setMsg(null);
    setErr(null);
  }

  async function removeSite(id: string, name: string) {
    const ok = confirm(`Smazat stavbu "${name}"? Pokud ma navazane zaznamy dochazky, doporucuji ji radeji deaktivovat.`);
    if (!ok) return;

    const t = token();
    if (!t) {
      setErr("Chybi prihlaseni.");
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
      if (!res.ok) throw new Error(data?.error || "Mazani selhalo.");

      setSites((prev) => prev.filter((s) => s.id !== id));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Mazani selhalo.");
    } finally {
      setDeletingId(null);
    }
  }

  const filteredSites = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("cs");
    if (!needle) return sites;
    return sites.filter((s) => [s.name, s.address || "", s.is_active ? "aktivni" : "neaktivni"].join(" ").toLocaleLowerCase("cs").includes(needle));
  }, [query, sites]);

  const stats = useMemo(() => ({
    total: sites.length,
    active: sites.filter((s) => s.is_active).length,
    inactive: sites.filter((s) => !s.is_active).length,
    avgRadius: sites.length ? Math.round(sites.reduce((acc, s) => acc + Number(s.radius_m || 0), 0) / sites.length) : 0,
  }), [sites]);

  return (
    <AppShell area="mixed" title="Stavby" subtitle="Mista, GPS radius a aktivita pro automaticke vyhodnoceni dochazky.">
      <section className="grid gap-3 md:grid-cols-4">
        <StatCard label="Celkem staveb" value={String(stats.total)} tone="slate" />
        <StatCard label="Aktivni" value={String(stats.active)} tone="emerald" />
        <StatCard label="Neaktivni" value={String(stats.inactive)} tone="amber" />
        <StatCard label="Prumer radiusu" value={`${stats.avgRadius} m`} tone="blue" />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{editingId ? "Upravit stavbu" : "Nova stavba"}</h2>
              <p className="mt-1 text-sm text-slate-500">Nazev, adresa, GPS souradnice a dosah pro automaticke rozpoznani polohy.</p>
            </div>
            {editingId ? <button className="rounded-lg border px-3 py-2 text-sm" onClick={resetForm}>Zrusit</button> : null}
          </div>

          <div className="mt-4 space-y-3">
            <Field label="Nazev">
              <input className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="Napriklad Kralupy" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>

            <Field label="Adresa" hint="Volitelne. Hodi se pro rychlou orientaci v administraci.">
              <input className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="Ulice, mesto" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Latitude">
                <input className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="50.123456" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
              </Field>
              <Field label="Longitude">
                <input className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="14.123456" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Radius (m)">
                <input className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="250" value={form.radius_m} onChange={(e) => setForm({ ...form, radius_m: e.target.value })} />
              </Field>
              <label className="flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-3 text-sm text-slate-700">
                <input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                Aktivni stavba
              </label>
            </div>

            <button className="w-full rounded-lg bg-slate-950 px-4 py-3 text-white" onClick={save}>
              {editingId ? "Ulozit zmeny" : "Pridat stavbu"}
            </button>

            {err && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>}
            {msg && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{msg}</div>}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Seznam staveb</h2>
              <p className="mt-1 text-sm text-slate-500">Prehled aktivnich i archivovanych mist s rychlou upravou.</p>
            </div>
            <div className="w-full max-w-sm">
              <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Hledat nazev nebo adresu" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {filteredSites.map((s) => (
              <article key={s.id} className="rounded-lg border border-slate-200 p-4 transition hover:border-slate-300 hover:shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-950">{s.name}</h3>
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${s.is_active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{s.is_active ? "Aktivni" : "Neaktivni"}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-500">
                      <span>Lat: {s.lat}</span>
                      <span>Lng: {s.lng}</span>
                      <span>Radius: {s.radius_m} m</span>
                    </div>
                    {s.address ? <div className="mt-2 text-sm text-slate-600">{s.address}</div> : null}
                  </div>
                  <div className="flex gap-2">
                    <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => edit(s)}>Upravit</button>
                    <button className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50" onClick={() => removeSite(s.id, s.name)} disabled={deletingId === s.id}>
                      {deletingId === s.id ? "Mazu..." : "Smazat"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {filteredSites.length === 0 && <div className="rounded-lg border bg-slate-50 p-5 text-sm text-slate-500">Tomuto filtru neodpovida zadna stavba.</div>}
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {hint ? <div className="mt-1 text-xs font-normal text-slate-500">{hint}</div> : null}
      {children}
    </label>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: "slate" | "emerald" | "blue" | "amber" }) {
  const tones = {
    slate: "border-slate-200 bg-white text-slate-950",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-950",
    blue: "border-blue-200 bg-blue-50 text-blue-950",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
  };
  return (
    <div className={`rounded-lg border p-4 shadow-sm ${tones[tone]}`}>
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}
