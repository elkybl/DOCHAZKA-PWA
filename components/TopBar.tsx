"use client";

import { useRouter } from "next/navigation";

export function TopBar({ title }: { title: string }) {
  const router = useRouter();

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("last_status");
    localStorage.removeItem("last_site_id");
    router.push("/login");
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <button
        onClick={() => router.back()}
        className="rounded-xl border bg-white px-3 py-2 text-sm shadow-sm"
        aria-label="Zpět"
      >
        ← Zpět
      </button>

      <div className="text-base font-semibold">{title}</div>

      <button
        onClick={logout}
        className="rounded-xl border bg-white px-3 py-2 text-sm shadow-sm"
      >
        Odhlásit
      </button>
    </div>
  );
}
