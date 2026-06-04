"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppNav";

type Site = {
  id: string;
  name: string;
};

type RateRow = {
  site_id: string;
  hourly_rate: number | null;
  km_rate: number | null;
  programming_rate: number | null;
  effective_from?: string | null;
};

type RatesResponse = {
  can_edit?: boolean;
  user_id?: string;
  target_user_name?: string;
  effective_from?: string;
  default_hourly_rate?: number | null;
  default_km_rate?: number | null;
  programming_rate?: number | null;
  is_programmer?: boolean;
  rows?: RateRow[];
  error?: string;
};

type RateFormRow = {
  site_id: string;
  hourly_rate: string;
  km_rate: string;
  programming_rate: string;
};

function token() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("token") || "";
}

function cleanNum(value: string) {
  const text = value.replace(/[^\d.,-]/g, "").replace(",", ".");
  return text;
}

function fmtRate(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${Number(value).toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} Kč`;
}

function toFormRows(rows: RateRow[] = []) {
  return rows.map((row) => ({
    site_id: row.site_id,
    hourly_rate: row.hourly_rate == null ? "" : String(row.hourly_rate),
    km_rate: row.km_rate == null ? "" : String(row.km_rate),
    programming_rate: row.programming_rate == null ? "" : String(row.programming_rate),
  }));
}

function normalizeForSave(rows: RateFormRow[]) {
  return rows
    .filter((row) => row.site_id)
    .map((row) => ({
      site_id: row.site_id,
      hourly_rate: row.hourly_rate === "" ? null : Number(row.hourly_rate.replace(",", ".")),
      km_rate: row.km_rate === "" ? null : Number(row.km_rate.replace(",", ".")),
      programming_rate: row.programming_rate === "" ? null : Number(row.programming_rate.replace(",", ".")),
    }))
    .filter((row) => row.hourly_rate != null || row.km_rate != null || row.programming_rate != null);
}

function RatesPageInner() {
  const params = useSearchParams();
  const requestedUserId = params.get("user_id") || "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [sites, setSites] = useState<Site[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [targetUserId, setTargetUserId] = useState("");
  const [targetUserName, setTargetUserName] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));

  const [defaultHourlyRate, setDefaultHourlyRate] = useState("");
  const [defaultKmRate, setDefaultKmRate] = useState("");
  const [programmingRate, setProgrammingRate] = useState("");
  const [isProgrammer, setIsProgrammer] = useState(false);
  const [rows, setRows] = useState<RateFormRow[]>([]);

  async function load() {
    setLoading(true);
    setErr(null);
    setMsg(null);

    const t = token();
    if (!t) {
      setErr("Chybí přihlášení.");
      setLoading(false);
      return;
    }

    const query = new URLSearchParams();
    if (requestedUserId) query.set("user_id", requestedUserId);
    if (effectiveFrom) query.set("effective_from", effectiveFrom);

    const [sitesRes, ratesRes] = await Promise.all([
      fetch("/api/sites"),
      fetch(`/api/me/rates?${query.toString()}`, {
        headers: { authorization: `Bearer ${t}` },
      }),
    ]);

    const sitesData = await sitesRes.json().catch(() => ({}));
    const ratesData = (await ratesRes.json().catch(() => ({}))) as RatesResponse;

    if (!sitesRes.ok) {
      setErr(sitesData?.error || "Nešlo načíst stavby.");
      setLoading(false);
      return;
    }
    if (!ratesRes.ok) {
      setErr(ratesData?.error || "Nešlo načíst sazby.");
      setLoading(false);
      return;
    }

    setSites((sitesData.sites || []) as Site[]);
    setCanEdit(!!ratesData.can_edit);
    setTargetUserId(ratesData.user_id || "");
    setTargetUserName(ratesData.target_user_name || "");
    setEffectiveFrom(ratesData.effective_from || new Date().toISOString().slice(0, 10));
    setDefaultHourlyRate(ratesData.default_hourly_rate == null ? "" : String(ratesData.default_hourly_rate));
    setDefaultKmRate(ratesData.default_km_rate == null ? "" : String(ratesData.default_km_rate));
    setProgrammingRate(ratesData.programming_rate == null ? "" : String(ratesData.programming_rate));
    setIsProgrammer(!!ratesData.is_programmer);
    setRows(toFormRows(ratesData.rows || []));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [requestedUserId]);

  useEffect(() => {
    if (!loading) {
      load();
    }
  }, [effectiveFrom]);

  function patchRow(index: number, key: keyof RateFormRow, value: string) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }

  function addRow() {
    setRows((prev) => [...prev, { site_id: "", hourly_rate: "", km_rate: "", programming_rate: "" }]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    const t = token();
    if (!t) {
      setErr("Chybí přihlášení.");
      return;
    }

    setSaving(true);
    setErr(null);
    setMsg(null);

    const payload = {
      user_id: targetUserId || undefined,
      effective_from: effectiveFrom,
      default_hourly_rate: defaultHourlyRate === "" ? null : Number(defaultHourlyRate.replace(",", ".")),
      default_km_rate: defaultKmRate === "" ? null : Number(defaultKmRate.replace(",", ".")),
      programming_rate: programmingRate === "" ? null : Number(programmingRate.replace(",", ".")),
      rows: normalizeForSave(rows),
    };

    const res = await fetch("/api/me/rates", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${t}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data?.error || "Nešlo uložit sazby.");
      setSaving(false);
      return;
    }

    setMsg("Sazby jsou uložené.");
    setSaving(false);
    await load();
  }

  const siteOptions = useMemo(
    () =>
      sites.filter((site) => !rows.some((row) => row.site_id === site.id)).sort((a, b) => a.name.localeCompare(b.name, "cs")),
    [sites, rows],
  );

  const actions = (
    <>
      {requestedUserId && canEdit ? (
        <Link href="/admin/users" className="rounded-lg border px-4 py-2 text-sm font-medium text-slate-700">
          Zpět na lidi
        </Link>
      ) : null}
      {canEdit ? (
        <button
          type="button"
          onClick={save}
          disabled={saving || loading}
          className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Ukládám..." : "Uložit sazby"}
        </button>
      ) : null}
    </>
  );

  return (
    <AppShell
      area="auto"
      title={requestedUserId && targetUserName ? `Sazby: ${targetUserName}` : "Moje sazby"}
      subtitle={
        canEdit
          ? "Administrace tu nastavuje základní sazby i výjimky pro konkrétní stavby s platností od určitého dne."
          : "Sazby jsou jen pro přehled. Upravuje je administrace, aby staré výplaty zůstaly stabilní."
      }
      actions={actions}
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Výchozí sazby</h2>
              <p className="mt-1 text-sm text-slate-500">Tohle je základ, který se použije, když stavba nemá vlastní přebití.</p>
            </div>
            {canEdit ? (
              <label className="text-sm font-medium text-slate-700">
                Platnost od
                <input
                  type="date"
                  className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                />
              </label>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Hodinovka
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                value={defaultHourlyRate}
                onChange={(e) => setDefaultHourlyRate(cleanNum(e.target.value))}
                inputMode="decimal"
                disabled={!canEdit}
                placeholder="Např. 280"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Km sazba
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                value={defaultKmRate}
                onChange={(e) => setDefaultKmRate(cleanNum(e.target.value))}
                inputMode="decimal"
                disabled={!canEdit}
                placeholder="Např. 8"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
              Programování
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                value={programmingRate}
                onChange={(e) => setProgrammingRate(cleanNum(e.target.value))}
                inputMode="decimal"
                disabled={!canEdit || !isProgrammer}
                placeholder={isProgrammer ? "Např. 650" : "Pracovník nemá režim programování"}
              />
            </label>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <div className="font-semibold text-slate-900">Aktuální přehled</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <div>Hodinovka: <span className="font-semibold text-slate-950">{fmtRate(defaultHourlyRate === "" ? null : Number(defaultHourlyRate.replace(",", ".")))}</span></div>
              <div>Km sazba: <span className="font-semibold text-slate-950">{fmtRate(defaultKmRate === "" ? null : Number(defaultKmRate.replace(",", ".")))}</span></div>
              <div>Programování: <span className="font-semibold text-slate-950">{fmtRate(programmingRate === "" ? null : Number(programmingRate.replace(",", ".")))}</span></div>
            </div>
          </div>

          {!canEdit ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Sazby tu vidíš jen pro přehled. Změny dělá administrace, aby se nepřepočítávaly staré dny a výplaty.
            </div>
          ) : null}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Sazby pro stavby</h2>
              <p className="mt-1 text-sm text-slate-500">Použij jen tam, kde má konkrétní akce jinou hodinovku, kilometry nebo programování.</p>
            </div>
            {canEdit ? (
              <button
                type="button"
                onClick={addRow}
                disabled={!siteOptions.length}
                className="rounded-lg border px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
              >
                Přidat stavbu
              </button>
            ) : null}
          </div>

          <div className="mt-4 space-y-3">
            {rows.map((row, index) => (
              <article key={`${row.site_id || "new"}-${index}`} className="rounded-2xl border border-slate-200 p-4">
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_auto]">
                  <label className="block text-sm font-medium text-slate-700">
                    Stavba
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                      value={row.site_id}
                      onChange={(e) => patchRow(index, "site_id", e.target.value)}
                      disabled={!canEdit}
                    >
                      <option value="">Vyber stavbu</option>
                      {sites.map((site) => (
                        <option key={site.id} value={site.id}>
                          {site.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block text-sm font-medium text-slate-700">
                    Hodinovka
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                      value={row.hourly_rate}
                      onChange={(e) => patchRow(index, "hourly_rate", cleanNum(e.target.value))}
                      inputMode="decimal"
                      disabled={!canEdit}
                    />
                  </label>

                  <label className="block text-sm font-medium text-slate-700">
                    Km sazba
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                      value={row.km_rate}
                      onChange={(e) => patchRow(index, "km_rate", cleanNum(e.target.value))}
                      inputMode="decimal"
                      disabled={!canEdit}
                    />
                  </label>

                  <label className="block text-sm font-medium text-slate-700">
                    Programování
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                      value={row.programming_rate}
                      onChange={(e) => patchRow(index, "programming_rate", cleanNum(e.target.value))}
                      inputMode="decimal"
                      disabled={!canEdit}
                    />
                  </label>

                  {canEdit ? (
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700"
                      >
                        Odebrat
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            ))}

            {rows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                Pro tohle datum zatím nejsou zadané žádné stavbové výjimky.
              </div>
            ) : null}
          </div>

          {err ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{err}</div> : null}
          {msg ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{msg}</div> : null}
        </section>
      </div>
    </AppShell>
  );
}

export default function RatesPage() {
  return (
    <Suspense
      fallback={
        <AppShell area="auto" title="Moje sazby" subtitle="Načítám sazby...">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-500">Načítám sazby…</div>
        </AppShell>
      }
    >
      <RatesPageInner />
    </Suspense>
  );
}
