"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (t) router.push("/attendance");
  }, [router]);

  async function login() {
    setErr(null);
    const p = pin.trim();
    if (!p) {
      setErr("Zadejte PIN.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin: p }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Přihlášení se nepodařilo.");

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      router.push(data.user?.role === "admin" ? "/admin" : "/attendance");
    } catch (e: unknown) {
      setErr(getErrorMessage(e, "Došlo k chybě."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] px-4 py-6 text-slate-950">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="space-y-6">
          <div className="inline-flex rounded-lg border border-blue-100 bg-white px-4 py-3 shadow-sm">
            <Image
              src="/ekybl-logo.png"
              alt="Elektro práce Lukáš Kybl"
              width={480}
              height={130}
              priority
              className="h-auto w-[280px] max-w-full sm:w-[380px]"
            />
          </div>

          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">Docházka / Finish</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Přehled práce, výplat a dopravy bez dohadů.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              Evidence docházky, akcí, materiálu a plateb v jedné aplikaci. Přehledy drží stav konkrétních záznamů, ne jen součty podle data.
            </p>
          </div>

          <div className="grid max-w-2xl gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-white bg-white/80 p-4 shadow-sm">
              <div className="text-sm font-semibold">Docházka</div>
              <div className="mt-1 text-xs leading-5 text-slate-600">Příchody, odchody a ruční opravy.</div>
            </div>
            <div className="rounded-lg border border-white bg-white/80 p-4 shadow-sm">
              <div className="text-sm font-semibold">Výplaty</div>
              <div className="mt-1 text-xs leading-5 text-slate-600">Zaplaceno, nezaplaceno i částečně.</div>
            </div>
            <div className="rounded-lg border border-white bg-white/80 p-4 shadow-sm">
              <div className="text-sm font-semibold">Exporty</div>
              <div className="mt-1 text-xs leading-5 text-slate-600">Podklady pro kontrolu a účetnictví.</div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-xl shadow-blue-950/10 sm:p-7">
          <div>
            <h2 className="text-xl font-semibold">Přihlášení</h2>
            <p className="mt-1 text-sm text-slate-600">Zadejte svůj PIN pro přístup do systému.</p>
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium text-slate-700">PIN</label>
            <input
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-lg tracking-[0.35em] outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/[^\d]/g, "").slice(0, 8))}
              onKeyDown={(e) => {
                if (e.key === "Enter") login();
              }}
              placeholder="••••"
            />
          </div>

          <button
            onClick={login}
            disabled={loading}
            className="mt-5 w-full rounded-lg bg-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Přihlašuji…" : "Přihlásit se"}
          </button>

          {err && <div className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">{err}</div>}

          <div className="mt-6 border-t pt-4 text-xs leading-5 text-slate-500">
            Přístupové údaje držte mimo obrazovku a sdílejte je jen interně.
          </div>
        </section>
      </div>
    </main>
  );
}
