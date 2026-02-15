"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function LogoMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-black text-white shadow-sm">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M13 2L3 14h8l-1 8 11-14h-8l0-6z" fill="currentColor" />
        </svg>
      </div>
      <div>
        <div className="text-lg font-semibold">Docházka & jízdy</div>
        <div className="text-xs text-neutral-600">rychlá evidence stavby, práce, km a materiálu</div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // když už je token, rovnou na docházku
    const t = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (t) router.push("/attendance");
  }, [router]);

  async function login() {
    setErr(null);
    setInfo(null);

    const p = pin.trim();
    if (!p) return setErr("Zadej PIN.");

    setLoading(true);
    try {
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin: p }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nešlo se přihlásit.");

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setInfo("Přihlášeno.");
      router.push("/attendance");
    } catch (e: any) {
      setErr(e.message || "Chyba");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl space-y-4 px-3 py-6">
      <div className="rounded-3xl border bg-white p-6 shadow-sm">
        <LogoMark />

        <p className="mt-4 text-sm text-neutral-700">
          Tahle aplikace slouží na jednoduchou evidenci příchodu/odchodu na stavbě, zapsání práce, kilometrů a materiálu ze svého.
          Funguje v prohlížeči – stačí internet a telefon.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            onClick={login}
            disabled={loading}
            className="rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
          >
            {loading ? "Přihlašuji…" : "Přihlásit"}
          </button>

          <Link
            href="/manual"
            className="rounded-2xl border bg-white px-4 py-3 text-center text-sm shadow-sm"
          >
            Zobrazit manuál
          </Link>
        </div>

        <div className="mt-5">
          <label className="block text-sm text-neutral-700">PIN</label>
          <input
            className="mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-sm"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^\d]/g, "").slice(0, 8))}
            placeholder="např. 2580"
          />
        </div>

        {err && <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{err}</div>}
        {info && <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">{info}</div>}

        <div className="mt-4 rounded-2xl border bg-amber-50 p-4 text-xs text-amber-900">
          Tip iPhone: Safari → Sdílet → Přidat na plochu (bude to jako aplikace).
        </div>
      </div>
    </main>
  );
}
