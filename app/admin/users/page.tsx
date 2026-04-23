"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppNav";

type U = {
  id: string;
  name: string;
  role: "admin" | "worker";
  is_active: boolean;
  google_sheet_url?: string | null;
  is_programmer?: boolean;
  programming_rate?: number | null;
  created_at: string;
};

type UserForm = {
  name: string;
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
    pin: "",
    role: "worker",
    is_active: true,
    google_sheet_url: "",
    is_programmer: false,
    programming_rate: "",
  };
}

export default function AdminUsers() {
  const [users, setUsers] = useState<U[]>([]);
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
      setErr("Chybi prihlaseni.");
      return;
    }

    const res = await fetch("/api/admin/users", {
      headers: { authorization: `Bearer ${t}` },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data?.error || "Chyba");
      return;
    }

    setUsers(data.users || []);
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

    const payload: {
      id?: string;
      name: string;
      pin?: string;
      role: "admin" | "worker";
      is_active: boolean;
      google_sheet_url: string | null;
      is_programmer: boolean;
      programming_rate: number | null;
    } = {
      name: form.name.trim(),
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
      setErr(data?.error || "Neslo ulozit.");
      return;
    }

    setMsg(editingId ? "Uzivatel upraven." : "Uzivatel pridan.");
    setEditingId(null);
    setForm(emptyForm());
    await load();
  }

  function edit(u: U) {
    setEditingId(u.id);
    setForm({
      name: u.name,
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
    const ok = confirm(`Smazat uzivatele "${name}"? Smazou se i jeho zaznamy dochazky.`);
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
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${t}` },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Mazani selhalo.");

      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Mazani selhalo.");
    } finally {
      setDeletingId(null);
    }
  }

  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("cs");
    if (!needle) return users;
    return users.filter((u) =>
      [u.name, u.role, u.is_programmer ? "programator" : "", u.is_active ? "aktivni" : "neaktivni"]
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
    <AppShell area="mixed" title="Lide" subtitle="Sprava pristupu, roli, exportu a programatorskych sazeb.">
      <section className="grid gap-3 md:grid-cols-4">
        <StatCard label="Celkem lidi" value={String(stats.total)} tone="slate" />
        <StatCard label="Aktivni" value={String(stats.active)} tone="emerald" />
        <StatCard label="Programatori" value={String(stats.programmers)} tone="blue" />
        <StatCard label="Admini" value={String(stats.admins)} tone="amber" />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{editingId ? "Upravit uzivatele" : "Novy uzivatel"}</h2>
              <p className="mt-1 text-sm text-slate-500">PIN, role, export do Google Sheetu a programatorsky rezim.</p>
            </div>
            {editingId ? <button className="rounded-lg border px-3 py-2 text-sm" onClick={resetForm}>Zrusit</button> : null}
          </div>

          <div className="mt-4 space-y-3">
            <Field label="Jmeno">
              <input className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="Napriklad Lukas" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>

            <Field label={editingId ? "Novy PIN" : "PIN"} hint={editingId ? "Kdyz nechas prazdne, PIN zustane stejny." : "Pouziva se pro prihlaseni."}>
              <input className="mt-1 w-full rounded-lg border px-3 py-2" placeholder={editingId ? "Nepovinne" : "PIN"} inputMode="numeric" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 8) })} />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Role">
                <select className="mt-1 w-full rounded-lg border px-3 py-2" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value === "admin" ? "admin" : "worker" })}>
                  <option value="worker">Pracovnik</option>
                  <option value="admin">Admin</option>
                </select>
              </Field>
              <label className="flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-3 text-sm text-slate-700">
                <input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                Aktivni ucet
              </label>
            </div>

            <Field label="Google Sheet URL" hint="Volitelne. Odkaz na osobni vykaz nebo export pracovnika.">
              <input className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="https://..." value={form.google_sheet_url} onChange={(e) => setForm({ ...form, google_sheet_url: e.target.value.slice(0, 500) })} />
            </Field>

            <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
              <label className="flex items-center gap-2 text-sm font-medium text-blue-950">
                <input type="checkbox" checked={!!form.is_programmer} onChange={(e) => setForm({ ...form, is_programmer: e.target.checked })} />
                Programator
              </label>
              <Field label="Programatorska sazba" hint="Kc za hodinu. Pracovnik si ji muze upravit i v casti Moje sazby.">
                <input className="mt-1 w-full rounded-lg border bg-white px-3 py-2" placeholder="Napriklad 650" inputMode="decimal" value={form.programming_rate} onChange={(e) => setForm({ ...form, programming_rate: e.target.value.replace(/[^\d.,]/g, "").slice(0, 10) })} disabled={!form.is_programmer} />
              </Field>
            </div>

            <button className="w-full rounded-lg bg-slate-950 px-4 py-3 text-white" onClick={save}>
              {editingId ? "Ulozit zmeny" : "Pridat uzivatele"}
            </button>

            {err && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>}
            {msg && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{msg}</div>}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Seznam lidi</h2>
              <p className="mt-1 text-sm text-slate-500">Jednotny prehled roli, aktivity a programatorskeho rezimu.</p>
            </div>
            <div className="w-full max-w-sm">
              <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Hledat jmeno, roli nebo stav" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {filteredUsers.map((u) => (
              <article key={u.id} className="rounded-lg border border-slate-200 p-4 transition hover:border-slate-300 hover:shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-950">{u.name}</h3>
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${u.is_active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{u.is_active ? "Aktivni" : "Neaktivni"}</span>
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${u.role === "admin" ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-800"}`}>{u.role === "admin" ? "Admin" : "Pracovnik"}</span>
                      {u.is_programmer ? <span className="rounded-full bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-800">Programator</span> : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-500">
                      <span>Sazba programovani: {u.programming_rate == null ? "nenastaveno" : `${u.programming_rate} Kc/h`}</span>
                      <span>Vytvoren: {new Date(u.created_at).toLocaleDateString("cs-CZ")}</span>
                    </div>
                    {u.google_sheet_url ? <a className="mt-2 inline-flex text-sm font-medium text-blue-700 underline" href={u.google_sheet_url} target="_blank" rel="noreferrer">Otevrit Google Sheet</a> : null}
                  </div>

                  <div className="flex gap-2">
                    <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => edit(u)}>Upravit</button>
                    <button className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50" onClick={() => removeUser(u.id, u.name)} disabled={deletingId === u.id}>
                      {deletingId === u.id ? "Mazu..." : "Smazat"}
                    </button>
                  </div>
                </div>
              </article>
            ))}

            {filteredUsers.length === 0 && <div className="rounded-lg border bg-slate-50 p-5 text-sm text-slate-500">Tomuto filtru neodpovida zadny uzivatel.</div>}
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
