"use client";

import React, { useEffect, useMemo, useRef } from "react";

export default function AdminTableShell({
  title,
  subtitle,
  filters,
  actions,
  children,
  minWidth = 1600,
}: {
  title: string;
  subtitle?: string;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  minWidth?: number;
}) {
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const mainScrollRef = useRef<HTMLDivElement | null>(null);

  // sync scrollLeft top scrollbar <-> table scrollbar
  useEffect(() => {
    const top = topScrollRef.current;
    const main = mainScrollRef.current;
    if (!top || !main) return;

    const onTop = () => {
      if (main.scrollLeft !== top.scrollLeft) main.scrollLeft = top.scrollLeft;
    };
    const onMain = () => {
      if (top.scrollLeft !== main.scrollLeft) top.scrollLeft = main.scrollLeft;
    };

    top.addEventListener("scroll", onTop, { passive: true });
    main.addEventListener("scroll", onMain, { passive: true });

    return () => {
      top.removeEventListener("scroll", onTop);
      main.removeEventListener("scroll", onMain);
    };
  }, []);

  const spacerStyle = useMemo(
    () => ({
      width: `${minWidth}px`,
      height: "1px",
    }),
    [minWidth]
  );

  return (
    <main className="space-y-4 px-3">
      {/* Sticky header */}
      <div className="sticky top-0 z-30 -mx-3 bg-neutral-50/90 px-3 py-3 backdrop-blur">
        <div className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs text-neutral-500">Admin</div>
              <h1 className="text-lg font-semibold">{title}</h1>
              {subtitle ? <div className="mt-2 text-xs text-neutral-600">{subtitle}</div> : null}
            </div>

            {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
          </div>

          {filters ? <div className="mt-4">{filters}</div> : null}
        </div>

        {/* Top horizontal scrollbar */}
        <div className="mt-3 rounded-2xl border bg-white p-2 shadow-sm">
          <div ref={topScrollRef} className="overflow-x-auto overscroll-x-contain">
            <div style={spacerStyle} />
          </div>
          <div className="mt-1 text-[11px] text-neutral-500">
            Posun do stran řeš tady nahoře (nemusíš sjíždět dolů).
          </div>
        </div>
      </div>

      {/* Table container */}
      <div className="overflow-hidden rounded-3xl border bg-white shadow-sm">
        <div ref={mainScrollRef} className="overflow-x-auto overscroll-x-contain">
          <div style={{ minWidth: `${minWidth}px` }}>{children}</div>
        </div>
      </div>
    </main>
  );
}