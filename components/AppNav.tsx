"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

const workerLinks = [
  { href: "/attendance", label: "Směna" },
  { href: "/me", label: "Moje" },
  { href: "/me/rates", label: "Sazby" },
  { href: "/me/edit", label: "Upravit" },
];

const adminLinks = [
  { href: "/admin", label: "Admin" },
  { href: "/admin/attendance", label: "Přehled" },
  { href: "/admin/payments", label: "Výplaty" },
  { href: "/admin/users", label: "Lidé" },
];

const adminMoreLinks = [
  { href: "/admin/sites", label: "Stavby" },
  { href: "/admin/site-requests", label: "Žádosti" },
];

function isActivePath(pathname: string | null, href: string) {
  return pathname === href || (href !== "/" && !!pathname?.startsWith(`${href}/`));
}

export function BottomNav({ variant = "worker" }: { variant?: "worker" | "admin" | "mixed" }) {
  const pathname = usePathname();
  const links =
    variant === "admin"
      ? adminLinks
      : variant === "mixed"
      ? [
          { href: "/attendance", label: "Směna" },
          { href: "/me", label: "Moje" },
          { href: "/admin", label: "Admin" },
          { href: "/admin/payments", label: "Výplaty" },
        ]
      : workerLinks;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 py-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
        {links.map((link) => {
          const active = isActivePath(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-lg px-2 py-2 text-center text-xs font-semibold transition ${
                active ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function AppShell({
  children,
  area = "worker",
  title,
  subtitle,
  actions,
}: {
  children: ReactNode;
  area?: "worker" | "admin" | "mixed" | "auto";
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const pathname = usePathname();
  const [isAdmin] = useState(() => {
    try {
      if (typeof window === "undefined") return false;
      const raw = localStorage.getItem("user");
      const user = raw ? JSON.parse(raw) : null;
      return user?.role === "admin";
    } catch {
      return false;
    }
  });

  const resolvedArea = area === "auto" ? (isAdmin ? "mixed" : "worker") : area;
  const showAdmin = resolvedArea === "admin" || resolvedArea === "mixed";
  const showWorker = resolvedArea === "worker" || resolvedArea === "mixed";

  return (
    <main className="min-h-screen bg-[#f4f7fb] px-3 pb-24 pt-4 text-slate-950 sm:px-5 md:pb-10 md:pt-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-5 rounded-lg border border-white bg-white/90 p-3 shadow-sm shadow-slate-200/70 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/attendance" className="flex min-w-0 items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-white">
                <Image
                  src="/ekybl-logo.png"
                  alt="Elektro práce Lukáš Kybl"
                  width={96}
                  height={56}
                  className="h-9 w-auto object-contain"
                />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-tight text-slate-950">Docházka</span>
                <span className="block text-xs text-slate-500">Elektro práce Lukáš Kybl</span>
              </span>
            </Link>

            <nav className="hidden flex-wrap items-center gap-1 md:flex">
              {showWorker &&
                workerLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                      isActivePath(pathname, link.href) ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              {showAdmin && <span className="mx-1 h-6 w-px bg-slate-200" />}
              {showAdmin &&
                [...adminLinks, ...adminMoreLinks].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                      isActivePath(pathname, link.href) ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
            </nav>
          </div>

          {(title || subtitle || actions) && (
            <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-slate-100 pt-4">
              <div>
                {title ? <h1 className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">{title}</h1> : null}
                {subtitle ? <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{subtitle}</p> : null}
              </div>
              {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
            </div>
          )}
        </header>

        {children}
      </div>

      <BottomNav variant={resolvedArea === "admin" ? "admin" : resolvedArea === "mixed" ? "mixed" : "worker"} />
    </main>
  );
}
