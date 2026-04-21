"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const workerLinks = [
  { href: "/attendance", label: "Docházka" },
  { href: "/trips", label: "Jízdy" },
  { href: "/me", label: "Moje" },
  { href: "/me/edit", label: "Upravit" },
];

const adminLinks = [
  { href: "/admin", label: "Admin" },
  { href: "/admin/attendance", label: "Docházka" },
  { href: "/admin/payments", label: "Výplaty" },
  { href: "/attendance", label: "Směna" },
];

export function BottomNav({ variant = "worker" }: { variant?: "worker" | "admin" }) {
  const pathname = usePathname();
  const links = variant === "admin" ? adminLinks : workerLinks;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 py-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
        {links.map((link) => {
          const active = pathname === link.href || (link.href !== "/" && pathname?.startsWith(`${link.href}/`));
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
