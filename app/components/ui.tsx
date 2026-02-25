import Link from "next/link";
import type { ReactNode } from "react";
import React from "react";

export function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-3xl border bg-white p-6 shadow-sm">{children}</div>;
}

export function SubCard({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border bg-neutral-50 p-4">{children}</div>;
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "ok" | "warn";
}) {
  const cls =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-800"
      : tone === "warn"
      ? "bg-amber-50 text-amber-800"
      : "bg-neutral-100 text-neutral-800";
  return <span className={`inline-block rounded-full px-3 py-1 text-xs ${cls}`}>{children}</span>;
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const cls =
    variant === "primary"
      ? "rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
      : "rounded-2xl border bg-white px-4 py-3 text-sm shadow-sm disabled:opacity-50";
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

type MenuLinkProps = {
  href: string;
  title?: string;
  desc?: string;
  icon?: string;
  children?: ReactNode;
};

export function MenuLink({ href, title, desc, icon, children }: MenuLinkProps) {
  const label = (children ?? title) as ReactNode;

  return (
    <Link
      href={href}
      className="rounded-2xl border bg-white px-4 py-3 shadow-sm transition hover:bg-neutral-50"
    >
      <div className="flex items-start gap-3">
        {icon ? (
          <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-2xl border bg-neutral-50 text-sm">
            {icon}
          </div>
        ) : null}

        <div className="min-w-0">
          <div className="text-sm font-semibold">{label}</div>
          {desc ? <div className="mt-0.5 text-xs text-neutral-600">{desc}</div> : null}
        </div>
      </div>
    </Link>
  );
}