"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

const workerLinks = [
  { href: "/attendance", label: "Docházka", short: "Docházka" },
  { href: "/calendar", label: "Kalendář", short: "Kalendář" },
  { href: "/projects", label: "Projekty", short: "Projekty" },
  { href: "/me", label: "Moje výdělky", short: "Výdělky" },
  { href: "/me/rates", label: "Sazby", short: "Sazby" },
];

const adminLinks = [
  { href: "/admin", label: "Admin", short: "Admin" },
  { href: "/admin/calendar", label: "Kalendář", short: "Kalendář" },
  { href: "/projects", label: "Projekty", short: "Projekty" },
  { href: "/admin/attendance", label: "Přehled", short: "Přehled" },
  { href: "/admin/payments", label: "Výplaty", short: "Výplaty" },
  { href: "/admin/users", label: "Lidé", short: "Lidé" },
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
            { href: "/attendance", label: "Docházka", short: "Docházka" },
            { href: "/calendar", label: "Kalendář", short: "Kalendář" },
            { href: "/projects", label: "Projekty", short: "Projekty" },
            { href: "/me", label: "Moje výdělky", short: "Výdělky" },
            { href: "/admin", label: "Admin", short: "Admin" },
          ]
        : workerLinks;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/98 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_36px_rgba(15,23,42,0.14)] backdrop-blur md:hidden">
      <div className={`mx-auto grid ${links.length === 5 ? "max-w-xl grid-cols-5" : "max-w-lg grid-cols-4"} gap-2`}>
        {links.map((link) => {
          const active = isActivePath(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex min-h-[68px] flex-col items-center justify-center rounded-2xl border px-2 py-3 text-center transition ${
                active
                  ? "border-blue-200 bg-blue-600 text-white shadow-[0_10px_24px_rgba(37,99,235,0.28)]"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span className={`h-1.5 w-8 rounded-full ${active ? "bg-white/90" : "bg-slate-200"}`} />
              <span className="mt-2 text-[11px] font-semibold leading-4">{link.short}</span>
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
    <main className="min-h-screen bg-[linear-gradient(180deg,#eef4ff_0%,#f8fbff_22%,#f4f7fb_100%)] px-3 pb-28 pt-4 text-slate-950 sm:px-5 md:pb-10 md:pt-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
          <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <Link href="/attendance" className="flex min-w-0 items-center gap-4">
                <Image
                  src="/ekybl-logo.png"
                  alt="Lukáš Kýbl"
                  width={920}
                  height={320}
                  className="h-auto w-[280px] max-w-full object-contain sm:w-[360px]"
                  unoptimized
                  priority
                />
              </Link>

              <div className="hidden items-center gap-3 md:flex">
                <nav className="hidden flex-wrap items-center gap-2 xl:flex">
                  {showWorker &&
                    workerLinks.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                          isActivePath(pathname, link.href) ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                        }`}
                      >
                        {link.label}
                      </Link>
                    ))}
                  {showAdmin ? <span className="mx-1 h-6 w-px bg-slate-200" /> : null}
                  {showAdmin &&
                    [...adminLinks, ...adminMoreLinks].map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                          isActivePath(pathname, link.href) ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                        }`}
                      >
                        {link.label}
                      </Link>
                    ))}
                </nav>
              </div>
            </div>
          </div>

          {(title || subtitle || actions) ? (
            <div className="flex flex-wrap items-end justify-between gap-3 px-4 py-5 sm:px-5">
              <div>
                {title ? <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{title}</h1> : null}
                {subtitle ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{subtitle}</p> : null}
              </div>
              {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
            </div>
          ) : null}
        </header>

        {children}
      </div>

      <BottomNav variant={resolvedArea === "admin" ? "admin" : resolvedArea === "mixed" ? "mixed" : "worker"} />
    </main>
  );
}
