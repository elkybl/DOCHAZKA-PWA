"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { dtCZ } from "@/lib/time"; // ✅ místo fmtDateTimeCZFromIso

type Site = {
  id: string;
  name: string;
  address?: string | null;
  lat: number;
  lng: number;
  radius_m: number;
  is_pending?: boolean;
};

type User = { id: string; name: string; role: "admin" | "worker"; is_programmer?: boolean };

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

function getUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user");
  return raw ? JSON.parse(raw) : null;
}

function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("last_site_id");
}

function getPosition(): Promise<{ lat: number; lng: number; accuracy_m?: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("GPS není dostupné"));

    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy_m: Math.round(pos.coords.accuracy),
        }),
      (err) => reject(new Error(err.message || "Nepovedlo se načíst polohu")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}


function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function TopBar({ title, showAdmin }: { title: string; showAdmin: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <div className="sticky top-0 z-20 -mx-3 bg-neutral-50/90 px-3 py-3 backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => router.back()}
          className="rounded-2xl border bg-white px-3 py-2 text-sm shadow-sm"
          aria-label="Zpět"
        >
          ←
        </button>

        <div className="flex items-center gap-2">
          <div className="text-base font-semibold">{title}</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-2xl border bg-white px-3 py-2 text-sm shadow-sm"
          >
            Menu
          </button>
          <button
            onClick={() => {
              clearSession();
              router.push("/login");
            }}
            className="rounded-2xl border bg-white px-3 py-2 text-sm shadow-sm"
          >
            Odhlásit
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 rounded-3xl border bg-white p-4 shadow-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <Link className="rounded-2xl border bg-white px-4 py-3 text-sm shadow-sm" href="/me">
              Moje výdělky
            </Link>
            <Link className="rounded-2xl border bg-white px-4 py-3 text-sm shadow-sm" href="/me/rates">
              Moje sazby
            </Link>
            <Link className="rounded-2xl border bg-white px-4 py-3 text-sm shadow-sm" href="/me/edit">
              Upravit záznamy
            </Link>
            <Link className="rounded-2xl border bg-white px-4 py-3 text-sm shadow-sm" href="/trips">
              Kniha jízd
            </Link>
            {showAdmin && (
              <Link className="rounded-2xl border bg-white px-4 py-3 text-sm shadow-sm" href="/admin">
                Admin
              </Link>
            )}
          </div>

          <button
            className="mt-3 w-full rounded-2xl border bg-neutral-50 px-4 py-3 text-sm"
            onClick={() => setOpen(false)}
          >
            Zavřít menu
          </button>
        </div>
      )}
    </div>
  );
}

export default function AttendancePage() {
  const router = useRouter();

  const [sites, setSites] = useState<Site[]>([]);
  const [selected, setSelected] = useState<string>("");

  const [status, setStatus] = useState<"OUT" | "IN">("OUT");
  const [openInTime, setOpenInTime] = useState<string | null>(null);

  const [noteWork, setNoteWork] = useState("");
  const [km, setKm] = useState("");

  const [matDesc, setMatDesc] = useState("");
  const [matAmount, setMatAmount] = useState("");

  // programování (jen pro programátory) – zadává se při odchodu jako část směny
  const [progHours, setProgHours] = useState("");
  const [progNote, setProgNote] = useState("");

  const [info, setInfo] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [showRequest, setShowRequest] = useState(false);
  const [repLeftAt, setRepLeftAt] = useState("");
  const [forgetReason, setForgetReason] = useState("");

  const [showNewSite, setShowNewSite] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [newSiteName, setNewSiteName] = useState("");
  const [newSiteAddr, setNewSiteAddr] = useState("");
  const [newSiteRadius, setNewSiteRadius] = useState("200");

  const user = useMemo(() => getUser(), []);

  function requireLogin() {
    const t = getToken();
    if (!t) {
      setErr("Nejdřív se přihlas.");
      return null;
    }
    return t;
  }

  async function loadSites() {
    const res = await fetch("/api/sites");
    const data = await res.json().catch(() => ({}));
    const list: Site[] = data.sites || [];
    setSites(list);
  }

  async function refreshStatus() {
    const t = getToken();
    if (!t) return;

    const r = await fetch("/api/attendance/status", {
      headers: { authorization: `Bearer ${t}` },
    });
    const d = await r.json().catch(() => ({}));

    if (d?.status === "IN") {
      setStatus("IN");
      setOpenInTime(d?.open?.in_time || null);
      if (d?.open?.site_id) setSelected(d.open.site_id);
    } else {
      setStatus("OUT");
      setOpenInTime(null);
    }
  }


  async function autoSelectNearestSite() {
    if (!sites.length) return null;
    try {
      const pos = await getPosition();
      let best: { id: string; dist: number } | null = null;
      for (const s of sites) {
        const d = haversineMeters({ lat: pos.lat, lng: pos.lng }, { lat: s.lat, lng: s.lng });
        const within = d <= (s.radius_m || 0);
        if (!within) continue;
        if (!best || d < best.dist) best = { id: s.id, dist: d };
      }
      if (best) {
        setSelected((cur) => cur || best!.id);
        localStorage.setItem("last_site_id", best.id);
        return best.id;
      }
      // none in radius -> offer new site request
      return null;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.push("/login");
      return;
    }

    loadSites().catch(() => {});
    refreshStatus().catch(() => {});

    const lastSite = localStorage.getItem("last_site_id");
    if (lastSite) setSelected((s) => s || lastSite);
  }, [router]);

  useEffect(() => {
    // after sites are loaded, try to auto-pick nearest when not on open shift
    if (sites.length && status === "OUT" && !selected) {
      autoSelectNearestSite().then((id) => {
        if (!id) {
          // keep empty -> user can request new site
        }
      });
    }
  }, [sites, status, selected]);


  async function doIn() {
    setErr(null);
    setInfo(null);
    setShowRequest(false);

    const token = requireLogin();
    if (!token) return;

    setLoading(true);
    try {
      const pos = await getPosition();
      let siteId = selected || localStorage.getItem("last_site_id") || "";
      if (!siteId) {
        let best: { id: string; dist: number } | null = null;
        for (const s of sites) {
          const d = haversineMeters({ lat: pos.lat, lng: pos.lng }, { lat: s.lat, lng: s.lng });
          if (d > (s.radius_m || 0)) continue;
          if (!best || d < best.dist) best = { id: s.id, dist: d };
        }
        if (best) {
          siteId = best.id;
          setSelected(best.id);
          localStorage.setItem("last_site_id", best.id);
        }
      }
      if (!siteId) {
        setShowNewSite(true);
        throw new Error("Nenašla se žádná stavba v dosahu. Založ dočasnou stavbu.");
      }
      const matAmt = matAmount ? Number(matAmount) : undefined;
      if (matAmount && (Number.isNaN(matAmt) || matAmt! < 0)) throw new Error("Materiál částka je neplatná.");
      const res = await fetch("/api/attendance/out", {st pos = await getPosition();
      let siteId = selected;
      if (!siteId) {
        // auto-pick nearest inside radius
        let best: { id: string; dist: number } | null = null;
        for (const s of sites) {
          const d = haversineMeters({ lat: pos.lat, lng: pos.lng }, { lat: s.lat, lng: s.lng });
          if (d > (s.radius_m || 0)) continue;
          if (!best || d < best.dist) best = { id: s.id, dist: d };
        }
        if (best) {
          siteId = best.id;
          setSelected(best.id);
          localStorage.setItem("last_site_id", best.id);
        }
      }
      if (!siteId) {
        setShowNewSite(true);
        throw new Error("Nenašla se žádná stavba v dosahu. Založ dočasnou stavbu.");
      }
      const res = await fetch("/api/attendance/in", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ site_id: siteId, ...pos }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Chyba při ukládání příchodu.");

      if (siteId) localStorage.setItem("last_site_id", siteId);
     setInfo(
		data?.distance_m != null
		? `Příchod uložen (${data.distance_m} m).`
		: "Příchod uložen."
);

      await refreshStatus();
    } catch (e: any) {
      setErr(e.message || "Chyba");
    } finally {
      setLoading(false);
    }
  }

  async function doOut() {
    setErr(null);
    setInfo(null);

    const token = requireLogin();
    if (!token) return;

    setLoading(true);
    try {
      const pos = await getPosition();
      let siteId = selected || localStorage.getItem("last_site_id") || "";
      if (!siteId) {
        let best: { id: string; dist: number } | null = null;
        for (const s of sites) {
          const d = haversineMeters({ lat: pos.lat, lng: pos.lng }, { lat: s.lat, lng: s.lng });
          if (d > (s.radius_m || 0)) continue;
          if (!best || d < best.dist) best = { id: s.id, dist: d };
        }
        if (best) {
          siteId = best.id;
          setSelected(best.id);
          localStorage.setItem("last_site_id", best.id);
        }
      }
      if (!siteId) {
        setShowNewSite(true);
        throw new Error("Nenašla se žádná stavba v dosahu. Založ dočasnou stavbu.");
      }
      const matAmt = matAmount ? Number(matAmount) : undefined;
      if (matAmount && (Number.isNaN(matAmt) || matAmt! < 0)) throw new Error("Materiál částka je neplatná.");
      const res = await fetch("/api/attendance/out", {st pos = await getPosition();
      const res = await fetch("/api/attendance/out", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          site_id: siteId,
          ...pos,
          note_work: noteWork.trim() || undefined,
          km: km ? Number(km) : undefined,
          material_desc: matDesc.trim() || undefined,
          material_amount: matAmt,
          programming_hours: user?.is_programmer && progHours ? Number(progHours) : undefined,
          programming_note: user?.is_programmer ? (progNote.trim() || undefined) : undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Chyba při ukládání odchodu.");

      setInfo(
  data?.distance_m != null
    ? `Odchod uložen (${data.distance_m} m).`
    : "Odchod uložen."
);
      setNoteWork("");
      setKm("");
      setMatDesc("");
      setMatAmount("");
      setProgHours("");
      setProgNote("");

      await refreshStatus();
    } catch (e: any) {
      setErr(e.message || "Chyba");
      setShowRequest(true);
    } finally {
      setLoading(false);
    }
  }

  async function requestOutByAdmin() {
    setErr(null);
    setInfo(null);

    const token = requireLogin();
    if (!token) return;

    if (!repLeftAt.trim()) return setErr("Doplň kdy jsi odešel (např. 16:50).");
    if (!forgetReason.trim()) return setErr("Doplň důvod, proč nebyl odchod.");
    if (!noteWork.trim()) return setErr("Doplň co se dělalo.");

    setLoading(true);
    try {
      const pos = await getPosition();
      let siteId = selected || localStorage.getItem("last_site_id") || "";
      if (!siteId) {
        let best: { id: string; dist: number } | null = null;
        for (const s of sites) {
          const d = haversineMeters({ lat: pos.lat, lng: pos.lng }, { lat: s.lat, lng: s.lng });
          if (d > (s.radius_m || 0)) continue;
          if (!best || d < best.dist) best = { id: s.id, dist: d };
        }
        if (best) {
          siteId = best.id;
          setSelected(best.id);
          localStorage.setItem("last_site_id", best.id);
        }
      }
      if (!siteId) {
        setShowNewSite(true);
        throw new Error("Nenašla se žádná stavba v dosahu. Založ dočasnou stavbu.");
      }
      const matAmt = matAmount ? Number(matAmount) : undefined;
      if (matAmount && (Number.isNaN(matAmt) || matAmt! < 0)) throw new Error("Materiál částka je neplatná.");
      const res = await fetch("/api/attendance/out", {st res = await fetch("/api/attendance/request-out", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          reported_left_at: repLeftAt.trim(),
          forget_reason: forgetReason.trim(),
          note_work: noteWork.trim(),
          km: km ? Number(km) : undefined,
          material_desc: matDesc.trim() || undefined,
          material_amount: matAmt,
          programming_hours: user?.is_programmer && progHours ? Number(progHours) : undefined,
          programming_note: user?.is_programmer ? (progNote.trim() || undefined) : undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nešlo odeslat žádost.");

      setInfo("Žádost o odchod odeslána adminovi. Směnu uzavře admin.");
      setShowRequest(false);
      setRepLeftAt("");
      setForgetReason("");
    } catch (e: any) {
      setErr(e.message || "Chyba");
    } finally {
      setLoading(false);
    }
  }

  async function createPendingSiteAndSelect() {
    setErr(null);
    setInfo(null);

    const token = requireLogin();
    if (!token) return;

    const name = newSiteName.trim();
    if (!name) return setErr("Doplň název akce.");

    const r = Number(newSiteRadius.replace(/[^\d]/g, ""));
    if (!r || r < 50) return setErr("Radius musí být aspoň 50 m (doporučení 200).");

    setLoading(true);
    try {
      const pos = await getPosition();
      let siteId = selected || localStorage.getItem("last_site_id") || "";
      if (!siteId) {
        let best: { id: string; dist: number } | null = null;
        for (const s of sites) {
          const d = haversineMeters({ lat: pos.lat, lng: pos.lng }, { lat: s.lat, lng: s.lng });
          if (d > (s.radius_m || 0)) continue;
          if (!best || d < best.dist) best = { id: s.id, dist: d };
        }
        if (best) {
          siteId = best.id;
          setSelected(best.id);
          localStorage.setItem("last_site_id", best.id);
        }
      }
      if (!siteId) {
        setShowNewSite(true);
        throw new Error("Nenašla se žádná stavba v dosahu. Založ dočasnou stavbu.");
      }
      const matAmt = matAmount ? Number(matAmount) : undefined;
      if (matAmount && (Number.isNaN(matAmt) || matAmt! < 0)) throw new Error("Materiál částka je neplatná.");
      const res = await fetch("/api/attendance/out", {st pos = await getPosition();

      const res = await fetch("/api/sites/pending", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name,
          address: newSiteAddr.trim() || undefined,
          lat: pos.lat,
          lng: pos.lng,
          radius_m: r,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nešlo vytvořit dočasnou stavbu.");

      const site: Site = data.site;
      setInfo("Dočasná stavba vytvořena. Vyber ji a dej příchod. Admin ji pak aktivuje.");
      setShowNewSite(false);
      setNewSiteName("");
      setNewSiteAddr("");
      setNewSiteRadius("200");

      await loadSites();
      setSelected(site.id);
      localStorage.setItem("last_site_id", site.id);
    } catch (e: any) {
      setErr(e.message || "Chyba");
    } finally {
      setLoading(false);
    }
  }

  const selectedSite = useMemo(() => sites.find((s) => s.id === selected) || null, [sites, selected]);

  return (
    <main className="mx-auto w-full max-w-xl space-y-4 px-3 lg:max-w-5xl">
      <TopBar title="Docházka" showAdmin={user?.role === "admin"} />

      <div className="rounded-3xl border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm text-neutral-600">Přihlášen</div>
            <div className="mt-1 text-xl font-semibold text-neutral-900">{user?.name || "—"}</div>
            {status === "IN" && openInTime && (
              <div className="mt-1 text-xs text-neutral-600">Otevřená směna od: {dtCZ(openInTime)}</div>
            )}
          </div>

          <div
            className={cx(
              "rounded-2xl px-4 py-2 text-sm font-medium",
              status === "IN" ? "bg-emerald-50 text-emerald-800" : "bg-neutral-100 text-neutral-800"
            )}
          >
            {status === "IN" ? "Přítomen" : "Nepřítomen"}
          </div>
        </div>

        <div className="mt-5 rounded-3xl border bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-neutral-600">Akce</div>
              <div className="mt-1 truncate text-lg font-semibold text-neutral-900">
                {selectedSite ? selectedSite.name : "Automaticky podle GPS"}
              </div>
              {selectedSite?.is_pending && (
                <div className="mt-1 text-xs text-neutral-600">Dočasná stavba (čeká na schválení adminem)</div>
              )}
            </div>

            <button
              onClick={() => setShowPicker(true)}
              className="shrink-0 rounded-2xl border bg-white px-4 py-2 text-sm shadow-sm"
            >
              Změnit
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <button
              onClick={() => setShowNewSite(true)}
              className="text-neutral-600 underline underline-offset-4"
              type="button"
            >
              Nenalezl jsem stavbu
            </button>

            <Link className="text-neutral-600 underline underline-offset-4" href="/me/edit">
              Doplnit práci
            </Link>

            <Link className="text-neutral-600 underline underline-offset-4" href="/me">
              Moje výdělky
            </Link>
          </div>
        </div>

        {showPicker && (
          <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-3 sm:items-center">
            <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-xl">
              <div className="text-base font-semibold text-neutral-900">Vybrat akci</div>
              <div className="mt-1 text-xs text-neutral-600">Použij jen když GPS vybrala špatně.</div>

              <select
                className="mt-4 w-full rounded-2xl border bg-white px-4 py-3 text-sm"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">Vyber…</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.is_pending ? " (dočasná)" : ""}
                  </option>
                ))}
              </select>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  className="rounded-2xl border bg-white px-4 py-3 text-sm"
                  onClick={() => setShowPicker(false)}
                >
                  Zavřít
                </button>
                <button
                  className="rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white"
                  onClick={() => {
                    if (selected) localStorage.setItem("last_site_id", selected);
                    setShowPicker(false);
                  }}
                >
                  Použít
                </button>
              </div>
            </div>
          </div>
        )}

          <div className="flex items-end">
            <button
              onClick={() => setShowNewSite((v) => !v)}
              className="w-full rounded-2xl border bg-white px-4 py-3 text-sm shadow-sm"
            >
              Akce není v seznamu
            </button>
          </div>
        </div>

        {showNewSite && (
          <div className="mt-4 rounded-3xl border bg-neutral-50 p-5">
            <div className="text-sm font-semibold text-neutral-900">Založit dočasnou stavbu z terénu</div>
            <div className="mt-1 text-xs text-neutral-600">Použije se tvoje aktuální GPS. Admin pak stavbu zkontroluje.</div>

            <label className="mt-4 block text-sm text-neutral-700">Název akce (povinné)</label>
            <input
              className="mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-sm"
              value={newSiteName}
              onChange={(e) => setNewSiteName(e.target.value.slice(0, 120))}
              placeholder="Např. Zásah – Novák, Kolín"
            />

            <label className="mt-4 block text-sm text-neutral-700">Adresa / poznámka (volitelné)</label>
            <input
              className="mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-sm"
              value={newSiteAddr}
              onChange={(e) => setNewSiteAddr(e.target.value.slice(0, 180))}
              placeholder="Ulice, město…"
            />

            <label className="mt-4 block text-sm text-neutral-700">Radius (m)</label>
            <input
              className="mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-sm"
              inputMode="numeric"
              value={newSiteRadius}
              onChange={(e) => setNewSiteRadius(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
              placeholder="200"
            />
            <div className="mt-2 text-xs text-neutral-600">Doporučení 200 m.</div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                onClick={createPendingSiteAndSelect}
                disabled={loading}
                className="rounded-2xl bg-black px-4 py-3 text-sm text-white shadow-sm disabled:opacity-50"
              >
                {loading ? "Vytvářím…" : "Vytvořit dočasnou stavbu"}
              </button>
              <button
                onClick={() => setShowNewSite(false)}
                className="rounded-2xl border bg-white px-4 py-3 text-sm shadow-sm"
              >
                Zrušit
              </button>
            </div>
          </div>
        )}

        <div className="mt-5 rounded-3xl border bg-white p-5 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
            <div>
              {status === "OUT" ? (
                <button
                  onClick={doIn}
                  disabled={loading}
                  className="w-full rounded-2xl bg-black px-4 py-4 text-base font-semibold text-white shadow-sm disabled:opacity-50"
                >
                  {loading ? "Ukládám…" : "PŘÍCHOD"}
                </button>
              ) : (
                <button
                  onClick={doOut}
                  disabled={loading}
                  className="w-full rounded-2xl bg-black px-4 py-4 text-base font-semibold text-white shadow-sm disabled:opacity-50"
                >
                  {loading ? "Ukládám…" : "ODCHOD"}
                </button>
              )}

              {status === "IN" && (
                <div className="mt-3 text-xs text-neutral-600">
                  Práci/km/materiál můžeš doplnit kdykoliv přes <Link className="underline" href="/me/edit">Doplnit práci</Link>.
                </div>
              )}
            </div>

            {status === "IN" && (
              <details className="rounded-2xl border bg-neutral-50 p-4">
                <summary className="cursor-pointer select-none text-sm font-medium text-neutral-900">
                  Doplnit teď (volitelné)
                </summary>

                <div className="mt-4 space-y-3">
                  <div>
                    <label className="block text-sm text-neutral-700">Co se dělalo</label>
                    <textarea
                      className="mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-sm"
                      rows={3}
                      value={noteWork}
                      onChange={(e) => setNoteWork(e.target.value)}
                      placeholder="Krátce: co + kde…"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm text-neutral-700">Km dnes</label>
                      <input
                        className="mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-sm"
                        inputMode="decimal"
                        value={km}
                        onChange={(e) => setKm(e.target.value.replace(/[^\d.]/g, "").slice(0, 8))}
                        placeholder="0"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-neutral-700">Materiál (Kč)</label>
                      <input
                        className="mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-sm"
                        inputMode="decimal"
                        value={matAmount}
                        onChange={(e) => setMatAmount(e.target.value.replace(/[^\d.]/g, "").slice(0, 10))}
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-neutral-700">Materiál – popis</label>
                    <input
                      className="mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-sm"
                      value={matDesc}
                      onChange={(e) => setMatDesc(e.target.value)}
                      placeholder="WAGO, páska, vruty…"
                    />
                  </div>

                  {user?.is_programmer && (
                    <div className="rounded-2xl border bg-white p-4">
                      <div className="text-sm font-medium text-neutral-900">Programování (volitelné)</div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-sm text-neutral-700">Hodiny</label>
                          <input
                            className="mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-sm"
                            inputMode="decimal"
                            value={progHours}
                            onChange={(e) => setProgHours(e.target.value.replace(/[^\d.]/g, "").slice(0, 6))}
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-neutral-700">Poznámka</label>
                          <input
                            className="mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-sm"
                            value={progNote}
                            onChange={(e) => setProgNote(e.target.value.slice(0, 200))}
                            placeholder="např. doma / servis…"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={doOut}
                    disabled={loading}
                    className="w-full rounded-2xl border bg-white px-4 py-3 text-sm font-semibold shadow-sm disabled:opacity-50"
                  >
                    {loading ? "Ukládám…" : "Uložit a odhlásit"}
                  </button>
                </div>
              </details>
            )}
          </div>

          {showRequest && (
            <div className="mt-4 rounded-3xl border bg-amber-50 p-5">
              <div className="text-sm font-semibold text-amber-950">Nemůžu dát odchod (jsem mimo stavbu)</div>
              <div className="mt-1 text-xs text-amber-900">Pošli žádost adminovi. Admin to schválí.</div>

              <label className="mt-4 block text-sm text-amber-950">Kdy jsi odešel (např. 16:50)</label>
              <input
                className="mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-sm"
                value={repLeftAt}
                onChange={(e) => setRepLeftAt(e.target.value.slice(0, 50))}
                placeholder="16:50"
              />

              <label className="mt-4 block text-sm text-amber-950">Proč nebyl odchod</label>
              <input
                className="mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-sm"
                value={forgetReason}
                onChange={(e) => setForgetReason(e.target.value.slice(0, 500))}
                placeholder="Zapomněl jsem, vybil se mobil, spěchal jsem…"
              />

              <button
                onClick={requestOutByAdmin}
                disabled={loading}
                className="mt-4 w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold shadow-sm disabled:opacity-50"
              >
                {loading ? "Odesílám…" : "Poslat žádost adminovi"}
              </button>
            </div>
          )}
        </div>

{err && <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{err}</div>}
          {info && <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">{info}</div>}
        </div>
      </div>



    </main>
  );
}
