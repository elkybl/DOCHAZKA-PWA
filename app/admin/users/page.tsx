"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppNav";

type U = {
  id: string;
  name: string;
  email?: string | null;
  role: "admin" | "worker";
  is_active: boolean;
  google_sheet_url?: string | null;
  is_programmer?: boolean;
  programming_rate?: number | null;
  created_at: string;
};

type UserProfile = {
  lastDay: string | null;
  unpaidTotal: number;
  totalAmount: number;
  workedDays: number;
};

type ExportRow = {
  user_id: string;
  user_name: string;
  day: string;
  total: number;
  paid: boolean;
};

type RiskRow = {
  user_id: string;
};

type UserForm = {
  name: string;
  email: string;
  pin: string;
  role: "admin" | "worker";
  is_active: boolean;
  google_sheet_url: string;
  is_programmer: boolean;
  programming_rate: string;
};

function token() {
  return localStorage.getItem("token");
}

function emptyForm(): UserForm {
  return {
    name: "",
    email: "",
    pin: "",
    role: "worker",
    is_active: true,
    google_sheet_url: "",
    is_programmer: false,
    programming_rate: "",
  };
}

function fmt(n: unknown) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  return x.toLocaleString("cs-CZ", { maximumFractionDigits: 2 });
}

export default function AdminUsers() {
  const [users, setUsers] = useState<U[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [riskCounts, setRiskCounts] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<UserForm>(emptyForm());
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

    const [usersRes, exportRes, dashboardRes] = await Promise.all([
      fetch("/api/admin/users", { headers: { authorization: `Bearer ${t}` } }),
      fetch(`/api/admin/export?from=${new Date(Date.now() - 45 * 86400000).toISOString()}&to=${new Date().toISOString()}`, { headers: { authorization: `Bearer ${t}` } }),
      fetch("/api/admin/dashboard", { headers: { authorization: `Bearer ${t}` } }),
    ]);

    const usersData = await usersRes.json().catch(() => ({}));
    if (!usersRes.ok) {
      setErr(usersData?.error || "Chyba");
      return;
    }
    const nextUsers = usersData.users || [];
    setUsers(nextUsers);

    const exportData = await exportRes.json().catch(() => ({}));
    const exportRows = (exportData.rows || []) as ExportRow[];
    const profileMap: Record<string, UserProfile> = {};
    for (const row of exportRows) {
      const current = profileMap[row.user_id] || { lastDay: null, unpaidTotal: 0, totalAmount: 0, workedDays: 0 };
      current.totalAmount += Number(row.total) || 0;
      if (!row.paid) current.unpaidTotal += Number(row.total) || 0;
      current.workedDays += 1;
      if (!current.lastDay || row.day > current.lastDay) current.lastDay = row.day;
      profileMap[row.user_id] = current;
    }
    setProfiles(profileMap);

    const dashboardData = await dashboardRes.json().catch(() => ({}));
    const riskMap: Record<string, number> = {};
    for (const risk of ((dashboardData.risks || []) as RiskRow[])) {
      riskMap[risk.user_id] = (riskMap[risk.user_id] || 0) + 1;
    }
    setRiskCounts(riskMap);
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

    const payload: {
      id?: string;
      name: string;
      email: string | null;
      pin?: string;
      role: "admin" | "worker";
      is_active: boolean;
      google_sheet_url: string | null;
      is_programmer: boolean;
      programming_rate: number | null;
    } = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      role: form.role,
      is_active: !!form.is_active,
      google_sheet_url: form.google_sheet_url.trim() || null,
      is_programmer: !!form.is_programmer,
      programming_rate: form.programming_rate === "" ? null : Number(form.programming_rate.replace(",", ".")),
    };
    if (form.pin) payload.pin = form.pin;
    if (editingId) payload.id = editingId;

    const res = await fetch("/api/admin/users", {
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

    setMsg(editingId ? "Uživatel upraven." : "Uživatel přidán.");
    setEditingId(null);
    setForm(emptyForm());
    await load();
  }

  function edit(u: U) {
    setEditingId(u.id);
    setForm({
      name: u.name,
      email: u.email || "",
      pin: "",
      role: u.role,
      is_active: u.is_active,
      google_sheet_url: u.google_sheet_url || "",
      is_programmer: !!u.is_programmer,
      programming_rate: u.programming_rate == null ? "" : String(u.programming_rate),
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

  async function removeUser(id: string, name: string) {
    const ok = confirm(`Smazat uživatele "${name}"? Smažou se i jeho záznamy docházky.`);
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
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${t}` },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Mazání selhalo.");

      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Mazání selhalo.");
    } finally {
      setDeletingId(null);
    }
  }

  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("cs");
    if (!needle) return users;
    return users.filter((u) =>
      [u.name, u.role, u.is_programmer ? "programátor" : "", u.is_active ? "aktivní" : "neaktivní"]
        .join(" ")
        .toLocaleLowerCase("cs")
        .includes(needle),
    );
  }, [query, users]);

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter((u) => u.is_active).length,
    programmers: users.filter((u) => u.is_programmer).length,
    admins: users.filter((u) => u.role === "admin").length,
  }), [users]);

  return (
    <AppShell area="mixed" title="Lidé" subtitle="Správa přístupů, rolí, sazeb a rychlý profil každého pracovníka.">
      <section className="grid gap-3 md:grid-cols-4">
        <StatCard label="Celkem lidí" value={String(stats.total)} tone="slate" />
        <StatCard label="Aktivní" value={String(stats.active)} tone="emerald" />
        <StatCard label="Programátoři" value={String(stats.programmers)} tone="blue" />
        <StatCard label="Admini" value={String(stats.admins)} tone="amber" />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{editingId ? "Upravit uživatele" : "Nový uživatel"}</h2>
              <p className="mt-1 text-sm text-slate-500">PIN, role, export do Google Sheetu a programátorský režim.</p>
            </div>
            {editingId ? <button className="rounded-lg border px-3 py-2 text-sm" onClick={resetForm}>Zrušit</button> : null}
          </div>

          <div className="mt-4 space-y-3">
            <Field label="Jméno">
              <input className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="Například Lukáš" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>

            <Field label="E-mail" hint="Použije se pro notifikace o plánované práci, vráceném dni a dalších změnách.">
              <input className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="jmeno@firma.cz" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value.slice(0, 200) })} />
            </Field>

            <Field label={editingId ? "Nový PIN" : "PIN"} hint={editingId ? "Když necháš prázdné, PIN zůstane stejný." : "Používá se pro přihlášení."}>
              <input className="mt-1 w-full rounded-lg border px-3 py-2" placeholder={editingId ? "Nepovinné" : "PIN"} inputMode="numeric" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 8) })} />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Role">
                <select className="mt-1 w-full rounded-lg border px-3 py-2" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value === "admin" ? "admin" : "worker" })}>
                  <option value="worker">Pracovník</option>
                  <option value="admin">Admin</option>
                </select>
              </Field>
              <label className="flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-3 text-sm text-slate-700">
                <input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                Aktivní účet
              </label>
            </div>

            <Field label="Google Sheet URL" hint="Volitelné. Odkaz na osobní výkaz nebo export pracovníka.">
              <input className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="https://..." value={form.google_sheet_url} onChange={(e) => setForm({ ...form, google_sheet_url: e.target.value.slice(0, 500) })} />
            </Field>

            <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
              <label className="flex items-center gap-2 text-sm font-medium text-blue-950">
                <input type="checkbox" checked={!!form.is_programmer} onChange={(e) => setForm({ ...form, is_programmer: e.target.checked })} />
                Programátor
              </label>
              <Field label="Programátorská sazba" hint="Kč za hodinu. Pracovník si ji může upravit i v části Moje sazby.">
                <input className="mt-1 w-full rounded-lg border bg-white px-3 py-2" placeholder="Například 650" inputMode="decimal" value={form.programming_rate} onChange={(e) => setForm({ ...form, programming_rate: e.target.value.replace(/[^\d.,]/g, "").slice(0, 10) })} disabled={!form.is_programmer} />
              </Field>
            </div>

            <button className="w-full rounded-lg bg-slate-950 px-4 py-3 text-white" onClick={save}>
              {editingId ? "Uložit změny" : "Přidat uživatele"}
            </button>

            {err && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>}
            {msg && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{msg}</div>}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Profily lidí</h2>
              <p className="mt-1 text-sm text-slate-500">Rychlý přehled aktivity, neuhrazených částek a posledního známého dne.</p>
            </div>
            <div className="w-full max-w-sm">
              <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Hledat jméno, roli nebo stav" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {filteredUsers.map((u) => {
              const profile = profiles[u.id] || { lastDay: null, unpaidTotal: 0, totalAmount: 0, workedDays: 0 };
              const riskCount = riskCounts[u.id] || 0;
              return (
                <article key={u.id} className="rounded-lg border border-slate-200 p-4 transition hover:border-slate-300 hover:shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-950">{u.name}</h3>
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${u.is_active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{u.is_active ? "Aktivní" : "Neaktivní"}</span>
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${u.role === "admin" ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-800"}`}>{u.role === "admin" ? "Admin" : "Pracovník"}</span>
                        {u.is_programmer ? <span className="rounded-full bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-800">Programátor</span> : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-500">
                        <span>Poslední aktivita: {profile.lastDay || "bez dat"}</span>
                        <span>Odpracované dny: {profile.workedDays}</span>
                        <span>Programování: {u.programming_rate == null ? "nenastaveno" : `${u.programming_rate} Kč/h`}</span>
                      </div>
                      {u.email ? <div className="mt-2 text-sm text-slate-500">{u.email}</div> : null}
                      {u.google_sheet_url ? <a className="mt-2 inline-flex text-sm font-medium text-blue-700 underline" href={u.google_sheet_url} target="_blank" rel="noreferrer">Otevřít Google Sheet</a> : null}
                    </div>

                    <div className="flex gap-2">
                      <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => edit(u)}>Upravit</button>
                      <button className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50" onClick={() => removeUser(u.id, u.name)} disabled={deletingId === u.id}>
                        {deletingId === u.id ? "Mažu..." : "Smazat"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-4">
                    <Mini label="Celkem v období" value={`${fmt(profile.totalAmount)} Kč`} />
                    <Mini label="K úhradě" value={`${fmt(profile.unpaidTotal)} Kč`} tone="amber" />
                    <Mini label="Rizika" value={String(riskCount)} tone={riskCount > 0 ? "red" : "slate"} />
                    <Mini label="Vytvořen" value={new Date(u.created_at).toLocaleDateString("cs-CZ")} />
                  </div>
                </article>
              );
            })}

            {filteredUsers.length === 0 && <div className="rounded-lg border bg-slate-50 p-5 text-sm text-slate-500">Tomuto filtru neodpovídá žádný uživatel.</div>}
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

function Mini({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "amber" | "red" }) {
  const cls = tone === "amber" ? "bg-amber-50 text-amber-900" : tone === "red" ? "bg-red-50 text-red-900" : "bg-slate-50 text-slate-900";
  return <div className={`rounded-lg border p-3 ${cls}`}><div className="text-xs opacity-70">{label}</div><div className="mt-1 font-semibold">{value}</div></div>;
}
