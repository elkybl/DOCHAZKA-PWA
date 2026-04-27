"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

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

type NavUser = { id: string; name: string; role: "admin" | "worker" };
type ProjectBundleLite = {
  tasks?: Array<{ id: string; title: string; status: "todo" | "doing" | "done"; due_date: string | null }>;
  assignees?: Array<{ task_id: string; user_id: string }>;
  activityLogs?: Array<{ id: string; task_id: string; actor_user_id: string | null; action: string; created_at: string }>;
};
type DashboardLite = {
  summary?: {
    pending_reviews?: number;
    open_shifts?: number;
    unpaid_events?: number;
    risk_count?: number;
  };
};
type Notice = {
  id: string;
  href: string;
  title: string;
  detail: string;
  tone: "blue" | "amber" | "emerald" | "slate" | "red";
};

function isActivePath(pathname: string | null, href: string) {
  return pathname === href || (href !== "/" && !!pathname?.startsWith(`${href}/`));
}

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

function getUser() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("user");
    return raw ? (JSON.parse(raw) as NavUser) : null;
  } catch {
    return null;
  }
}

function toneClass(tone: Notice["tone"]) {
  if (tone === "red") return "border-red-200 bg-red-50 text-red-800";
  if (tone === "amber") return "border-amber-200 bg-amber-50 text-amber-800";
  if (tone === "emerald") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (tone === "blue") return "border-blue-200 bg-blue-50 text-blue-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function NotificationCenter({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function load() {
    const token = getToken();
    const user = getUser();
    if (!token || !user) return;

    setLoading(true);
    try {
      const headers = { authorization: `Bearer ${token}` };
      const requests: Promise<Response>[] = [fetch("/api/projects", { headers })];
      if (isAdmin) requests.push(fetch("/api/admin/dashboard", { headers }));
      const [projectsRes, dashboardRes] = await Promise.all(requests);

      const projectsData = (await projectsRes.json().catch(() => ({}))) as ProjectBundleLite;
      const dashboardData = dashboardRes
        ? ((await dashboardRes.json().catch(() => ({}))) as DashboardLite)
        : null;

      const notices: Notice[] = [];

      const myTaskIds = new Set(
        (projectsData.assignees || [])
          .filter((item) => item.user_id === user.id)
          .map((item) => item.task_id),
      );
      const myOpenTasks = (projectsData.tasks || []).filter((task) => myTaskIds.has(task.id) && task.status !== "done");
      const overdueTasks = myOpenTasks.filter((task) => {
        if (!task.due_date) return false;
        const due = new Date(`${task.due_date}T12:00:00`);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return due.getTime() < today.getTime();
      });

      if (overdueTasks.length) {
        notices.push({
          id: "overdue-tasks",
          href: "/projects",
          title: "Úkoly po termínu",
          detail: `${overdueTasks.length} úkolů čeká po termínu na dokončení nebo přesun.`,
          tone: "red",
        });
      }

      if (myOpenTasks.length) {
        notices.push({
          id: "my-open-tasks",
          href: "/projects",
          title: "Moje otevřené úkoly",
          detail: `${myOpenTasks.length} úkolů je právě rozpracovaných nebo čeká na vyřešení.`,
          tone: "blue",
        });
      }

      const recentForeignActivity = (projectsData.activityLogs || [])
        .filter((item) => item.actor_user_id && item.actor_user_id !== user.id)
        .slice(0, 1);
      if (recentForeignActivity.length) {
        notices.push({
          id: "recent-project-activity",
          href: "/projects",
          title: "Nová aktivita v projektech",
          detail: "V projektech přibyly nové změny od ostatních lidí.",
          tone: "emerald",
        });
      }

      if (isAdmin && dashboardData?.summary) {
        if ((dashboardData.summary.pending_reviews || 0) > 0) {
          notices.push({
            id: "pending-reviews",
            href: "/admin/attendance",
            title: "Dny čekají na kontrolu",
            detail: `${dashboardData.summary.pending_reviews} dnů potřebuje admin kontrolu nebo vrácení.`,
            tone: "amber",
          });
        }
        if ((dashboardData.summary.open_shifts || 0) > 0) {
          notices.push({
            id: "open-shifts",
            href: "/admin/attendance",
            title: "Neuzavřené dny",
            detail: `${dashboardData.summary.open_shifts} dnů stále nemá správně uzavřený odchod.`,
            tone: "blue",
          });
        }
        if ((dashboardData.summary.unpaid_events || 0) > 0) {
          notices.push({
            id: "unpaid-events",
            href: "/admin/payments",
            title: "Položky k úhradě",
            detail: `${dashboardData.summary.unpaid_events} záznamů je stále otevřených k úhradě.`,
            tone: "amber",
          });
        }
        if ((dashboardData.summary.risk_count || 0) > 0) {
          notices.push({
            id: "risk-count",
            href: "/admin",
            title: "Rizikové dny",
            detail: `${dashboardData.summary.risk_count} rizikových dnů je dobré projít dřív než výplaty.`,
            tone: "red",
          });
        }
      }

      setItems(notices.slice(0, 6));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [isAdmin]);

  const count = items.length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex h-11 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
      >
        Přehled
        {count ? (
          <span className="ml-2 inline-flex min-w-[24px] items-center justify-center rounded-full bg-blue-600 px-2 py-1 text-[11px] font-bold text-white">
            {count}
          </span>
        ) : (
          <span className="ml-2 text-slate-400">0</span>
        )}
      </button>

      {open ? (
        <div className="absolute right-0 top-14 z-50 w-[360px] max-w-[calc(100vw-2rem)] rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_30px_80px_rgba(15,23,42,0.16)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-950">Co je potřeba řešit</div>
              <div className="mt-1 text-xs text-slate-500">Rychlý souhrn změn, projektů a dnů k dořešení.</div>
            </div>
            <button
              type="button"
              onClick={load}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              {loading ? "Načítám" : "Obnovit"}
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {items.length ? (
              items.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`block rounded-2xl border px-4 py-3 transition hover:shadow-sm ${toneClass(item.tone)}`}
                >
                  <div className="text-sm font-semibold">{item.title}</div>
                  <div className="mt-1 text-xs leading-5">{item.detail}</div>
                </Link>
              ))
            ) : (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                Teď tu není nic naléhavého. Systém je v klidném stavu.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
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
                <NotificationCenter isAdmin={isAdmin} />
              </div>
            </div>
          </div>

          {(title || subtitle || actions) && (
            <div className="flex flex-wrap items-end justify-between gap-3 px-4 py-5 sm:px-5">
              <div>
                {title ? <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{title}</h1> : null}
                {subtitle ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{subtitle}</p> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="md:hidden">
                  <NotificationCenter isAdmin={isAdmin} />
                </div>
                {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
              </div>
            </div>
          )}
        </header>

        {children}
      </div>

      <BottomNav variant={resolvedArea === "admin" ? "admin" : resolvedArea === "mixed" ? "mixed" : "worker"} />
    </main>
  );
}
