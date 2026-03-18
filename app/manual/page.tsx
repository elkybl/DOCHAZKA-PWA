import Link from "next/link";

function LogoMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-black text-white shadow-sm">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M13 2L3 14h8l-1 8 11-14h-8l0-6z" fill="currentColor" />
        </svg>
      </div>
      <div>
        <div className="text-lg font-semibold">Docházkový systém</div>
        <div className="text-xs text-neutral-600">Evidence práce, dopravy a materiálu</div>
      </div>
    </div>
  );
}

export default function ManualPublicPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-3 py-6">
      <div className="rounded-3xl border bg-white p-6 shadow-sm">
        <LogoMark />

        <p className="mt-4 text-sm text-neutral-700">
          Webová aplikace pro evidenci docházky, vykázané práce, dopravy a materiálu. Funguje v telefonu i na počítači a je vhodná pro každodenní provoz v terénu.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/login" className="rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white shadow-sm">
            Přihlášení
          </Link>
          <Link href="/attendance" className="rounded-2xl border bg-white px-4 py-3 text-sm shadow-sm">
            Otevřít docházku
          </Link>
        </div>

        <div className="mt-4 rounded-2xl border bg-amber-50 p-4 text-xs text-amber-900">
          Tip pro iPhone: v Safari otevřete Sdílet → Přidat na plochu. Aplikace se pak chová podobně jako běžná mobilní aplikace.
        </div>
      </div>

      <div className="rounded-3xl border bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold">Jak systém používat</h2>

        <div className="mt-3 space-y-5 text-sm text-neutral-700">
          <div className="rounded-2xl border bg-neutral-50 p-4">
            <div className="text-sm font-semibold text-neutral-900">Pro zaměstnance</div>
            <div className="mt-2 space-y-2">
              <div>Vyberte stavbu a potvrďte příchod. Systém uloží čas i polohu.</div>
              <div>Na konci dne doplňte vykonanou práci. Kilometry a materiál jsou volitelné.</div>
              <div>Pokud odchod nelze potvrdit na místě, použijte odchod bez polohy a zadejte skutečný čas odchodu.</div>
              <div>Pokud stavba není v seznamu, vytvořte dočasnou stavbu přímo z terénu.</div>
            </div>
          </div>

          <div className="rounded-2xl border bg-neutral-50 p-4">
            <div className="text-sm font-semibold text-neutral-900">Pro administrátora</div>
            <div className="mt-2 space-y-2">
              <div>Nastavte stavby, GPS bod a radius podle skutečného místa výkonu práce.</div>
              <div>Vytvořte uživatele a přidělte jim PIN pro přihlášení.</div>
              <div>Kontrolujte dočasné stavby, docházku, podklady pro výplaty a exporty.</div>
              <div>Ve výplatách můžete označit jako zaplacené celé období pro konkrétního pracovníka a akci.</div>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-4 text-xs text-neutral-600">
            Doporučení pro zápis práce: pište stručně a věcně, ideálně ve formátu „co + kde + rozsah".
            Příklad: „Zapojení rozvaděče, 1. NP, dokončení okruhu osvětlení a zásuvek“.
          </div>
        </div>
      </div>
    </main>
  );
}
