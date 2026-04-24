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
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (token) router.push("/attendance");
  }, [router]);

  async function login() {
    setErr(null);
    const value = pin.trim();
    if (!value) {
      setErr("Zadejte PIN.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin: value }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Přihlášení se nepodařilo.");

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      router.push(data.user?.role === "admin" ? "/admin" : "/attendance");
    } catch (error: unknown) {
      setErr(getErrorMessage(error, "Došlo k chybě."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#eef4ff_0%,#ffffff_48%,#f4f7fb_100%)] px-4 py-6 text-slate-950">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl items-center gap-6 lg:grid-cols-[1.12fr_0.88fr] lg:items-center">
        <section className="space-y-6 lg:pr-6">
          <div className="flex w-full max-w-[560px] items-center justify-center rounded-[28px] border border-slate-200 bg-white px-6 py-5 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
            <Image
              src="/ekybl-logo.png"
              alt="Lukáš Kýbl"
              width={1400}
              height={900}
              priority
              className="h-auto w-full max-w-[520px] object-contain"
            />
          </div>

          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-700">Software • Vývoj • Automatizace</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Firemní data pod kontrolou v jednom systému.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              Docházka Finish drží pohromadě docházku, práci, materiál, dopravu, kalendář i navazující finance. Cílem je přehled,
              který sedí s realitou v datech a je srozumitelný pro uživatele i admin část.
            </p>
          </div>

          <div className="grid max-w-2xl gap-3 sm:grid-cols-3">
            <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-950">Docházka</div>
              <div className="mt-1 text-xs leading-5 text-slate-600">Příchody, odchody a úpravy dne.</div>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-950">Finance</div>
              <div className="mt-1 text-xs leading-5 text-slate-600">Zaplaceno, nezaplaceno i částečně.</div>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-950">Administrace</div>
              <div className="mt-1 text-xs leading-5 text-slate-600">Kalendář, kontrola dnů a exporty.</div>
            </div>
          </div>
        </section>

        <section className="justify-self-start rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_rgba(15,23,42,0.14)] sm:p-7 lg:w-full lg:max-w-[520px]">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">Přihlášení</div>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">Vstup do systému</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Zadejte svůj PIN pro přístup do aplikace.</p>
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium text-slate-700">PIN</label>
            <input
              className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-lg tracking-[0.35em] outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
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
            className="mt-5 w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_45px_rgba(37,99,235,0.28)] transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Přihlašuji..." : "Přihlásit se"}
          </button>

          {err ? <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{err}</div> : null}

          <div className="mt-6 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500">
            Přístupové údaje držte mimo obrazovku a sdílejte je jen interní cestou.
          </div>
        </section>
      </div>
    </main>
  );
}


