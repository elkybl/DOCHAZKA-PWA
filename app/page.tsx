"use client";

import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#f4f7fb] px-4 py-8">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col justify-center">
        <div className="max-w-3xl">
          <Image
            src="/ekybl-logo.png"
            alt="Elektro práce Lukáš Kybl"
            width={520}
            height={140}
            priority
            className="h-auto w-[320px] max-w-full"
          />
          <p className="mt-8 text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">Docházka / Finish</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950 sm:text-6xl">
            Profesionální evidence práce pro terén i administraci.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
            Docházka, akce, doprava, materiál, offsite položky a výplaty v jednom přehledném systému.
          </p>

          <div className="mt-7">
            <Link
              href="/login"
              className="rounded-lg bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800"
            >
              Přihlásit se
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
