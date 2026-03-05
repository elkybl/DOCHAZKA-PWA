"use client";

import Link from "next/link";

export default function HomePage() {
  return (
    <main className="space-y-4">
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h1 className="text-lg font-semibold">Docházka</h1>
        <p className="mt-1 text-sm text-neutral-600">Přihlášení a evidence příchod/odchod + mimo stavbu.</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/login"
            className="rounded-xl bg-black px-4 py-3 text-sm text-white shadow-sm"
          >
            Přihlásit
          </Link>
        </div>
      </div>
    </main>
  );
}
