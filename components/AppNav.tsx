"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

const workerLinks = [
  { href: "/attendance", label: "Docházka" },
  { href: "/calendar", label: "Kalendář" },
  { href: "/me", label: "Moje výdělky" },
  { href: "/me/rates", label: "Sazby" },
];

const adminLinks = [
  { href: "/admin", label: "Admin" },
  { href: "/admin/calendar", label: "Kalendář" },
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
            { href: "/attendance", label: "Docházka" },
            { href: "/calendar", label: "Kalendář" },
            { href: "/me", label: "Moje" },
            { href: "/admin", label: "Admin" },
          ]
        : workerLinks;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 py-2 shadow-[0_-12px_28px_rgba(15,23,42,0.10)] backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
        {links.map((link) => {
          const active = isActivePath(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-xl px-2 py-2 text-center text-xs font-semibold transition ${
                active ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
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
    <main className="min-h-screen bg-[linear-gradient(180deg,#eef4ff_0%,#f8fbff_22%,#f4f7fb_100%)] px-3 pb-24 pt-4 text-slate-950 sm:px-5 md:pb-10 md:pt-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
          <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <Link href="/attendance" className="flex min-w-0 items-center gap-4">
                <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <Image
                    src="/ekybl-logo.png"
                    alt="Lukáš Kýbl"
                    width={420}
                    height={150}
                    className="h-12 w-auto object-contain sm:h-14"
                    priority
                  />
                </div>
              </Link>

              <nav className="hidden flex-wrap items-center gap-2 md:flex">
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
                {showAdmin && <span className="mx-1 h-6 w-px bg-slate-200" />}
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

          {(title || subtitle || actions) && (
            <div className="flex flex-wrap items-end justify-between gap-3 px-4 py-5 sm:px-5">
              <div>
                {title ? <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{title}</h1> : null}
                {subtitle ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{subtitle}</p> : null}
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
