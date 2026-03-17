"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

function getUser() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user");
  return raw ? JSON.parse(raw) : null;
}

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export default function AdminHome() {
  const router = useRouter();

  useEffect(() => {
    const t = getToken();
    const u = getUser();
    if (!t || !u || u.role !== "admin") router.push("/login");
  }, [router]);

  return (
    <main className="space-y-4 px-3">
      <div className="rounded-3xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Admin</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Správa staveb, uživatelů, dočasných akcí, žádostí o odchod a vyplácení.
        </p>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Link className="rounded-2xl border bg-white px-4 py-4 text-sm shadow-sm" href="/admin/sites">
            Stavby
          </Link>
          <Link className="rounded-2xl border bg-white px-4 py-4 text-sm shadow-sm" href="/admin/users">
            Uživatelé
          </Link>

          <Link className="rounded-2xl border bg-white px-4 py-4 text-sm shadow-sm" href="/admin/site-requests">
            Dočasné stavby
          </Link>

          <Link className="rounded-2xl border bg-white px-4 py-4 text-sm shadow-sm" href="/admin/close-requests">
            Žádosti o odchod
          </Link>

          <Link className="rounded-2xl border bg-white px-4 py-4 text-sm shadow-sm" href="/admin/attendance">
            Docházka (detail)
          </Link>
          <Link className="rounded-2xl border bg-white px-4 py-4 text-sm shadow-sm" href="/admin/payments">
            Vyplácení + CSV
          </Link>

          <Link className="rounded-2xl border bg-white px-4 py-4 text-sm shadow-sm" href="/attendance">
            Zpět na Docházku
          </Link>
        </div>
      </div>
    </main>
  );
}
