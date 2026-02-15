"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type U = {
  id: string;
  name: string;
  role: "admin" | "worker";
  is_active: boolean;
  created_at: string;
};

function token() {
  return localStorage.getItem("token");
}

export default function AdminUsers() {
  const [users, setUsers] = useState<U[]>([]);
  const [form, setForm] = useState<any>({ name: "", pin: "", role: "worker", is_active: true });
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
      setErr("Chybí přihlášení.");
      return;
    }

    const payload: any = {
      name: form.name,
      role: form.role,
      is_active: !!form.is_active,
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

    setMsg("Uloženo.");
    setEditingId(null);
    setForm({ name: "", pin: "", role: "worker", is_active: true });
    await load();
  }

  function edit(u: U) {
    setEditingId(u.id);
    setForm({ name: u.name, pin: "", role: u.role, is_active: u.is_active });
    setMsg(null);
    setErr(null);
  }

  function resetForm() {
    setEditingId(null);
    setForm({ name: "", pin: "", role: "worker", is_active: true });
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
      if (!res.ok) throw new Error(data?.error || "Smazání selhalo.");

      setUsers((prev) => prev.filter((u) => u.id !== id));
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
            <h1 className="text-lg font-semibold">Uživatelé</h1>
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
            placeholder="Jméno"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />

          <input
            className="rounded-xl border px-3 py-2"
            placeholder={editingId ? "Nový PIN (nepovinné)" : "PIN"}
            inputMode="numeric"
            value={form.pin}
            onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 8) })}
          />

          <div className="grid grid-cols-2 items-center gap-2">
            <select
              className="rounded-xl border px-3 py-2"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="worker">worker</option>
              <option value="admin">admin</option>
            </select>

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
            {editingId ? "Uložit změny" : "Přidat uživatele"}
          </button>

          {err && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</div>}
          {msg && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{msg}</div>}
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-neutral-700">Seznam</h2>

        <div className="mt-3 space-y-2">
          {users.map((u) => (
            <div key={u.id} className="rounded-xl border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{u.name}</div>
                  <div className="text-xs text-neutral-600">
                    {u.role} • {u.is_active ? "aktivní" : "neaktivní"}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button className="rounded-xl border px-3 py-2 text-sm" onClick={() => edit(u)}>
                    Edit
                  </button>

                  <button
                    className="rounded-xl border px-3 py-2 text-sm disabled:opacity-50"
                    onClick={() => removeUser(u.id, u.name)}
                    disabled={deletingId === u.id}
                    title="Smazat uživatele"
                  >
                    {deletingId === u.id ? "Mažu…" : "Smazat"}
                  </button>
                </div>
              </div>
            </div>
          ))}

          {users.length === 0 && (
            <div className="rounded-xl border bg-neutral-50 p-4 text-sm text-neutral-600">
              Zatím žádní uživatelé.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
