import Link from "next/link";

function LogoMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-black text-white shadow-sm">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M13 2L3 14h8l-1 8 11-14h-8l0-6z"
            fill="currentColor"
          />
        </svg>
      </div>
      <div>
        <div className="text-lg font-semibold">Docházka & jízdy</div>
        <div className="text-xs text-neutral-600">přehled práce, kilometrů a materiálu</div>
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
          Tohle je jednoduchá webová aplikace na evidenci příchodu/odchodu na stavbě, práce, kilometrů a materiálu ze svého.
          Funguje přes internet v prohlížeči (iPhone/Android) a jde si ji dát na plochu jako ikonku.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/login" className="rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white shadow-sm">
            Jít na přihlášení
          </Link>
          <Link href="/attendance" className="rounded-2xl border bg-white px-4 py-3 text-sm shadow-sm">
            Jsem přihlášen → Docházka
          </Link>
        </div>

        <div className="mt-4 rounded-2xl border bg-amber-50 p-4 text-xs text-amber-900">
          Tip iPhone: Safari → Sdílet → Přidat na plochu (bude to jako aplikace).
        </div>
      </div>

      <div className="rounded-3xl border bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold">Manuál</h2>

        <div className="mt-3 space-y-5 text-sm text-neutral-700">
          <div className="rounded-2xl border bg-neutral-50 p-4">
            <div className="text-sm font-semibold text-neutral-900">Zaměstnanec – jak to používat</div>
            <div className="mt-2 space-y-2">
              <div>
                Vyber stavbu a dej PŘÍCHOD. Aplikace uloží čas a GPS. Příchod/odchod funguje jen v radiusu stavby.
              </div>
              <div>
                Na konci dne vyplň co se dělalo (povinné). Km a materiál ze svého jsou volitelné (popis + částka). Pak dej ODCHOD.
              </div>
              <div>
                Když nejde odchod (jsi už doma): pošli žádost adminovi s časem odchodu + důvodem + co se dělalo. Admin to schválí.
              </div>
              <div>
                Když akce není v seznamu: založ “dočasnou stavbu” z terénu (název + GPS). Admin ji pak aktivuje.
              </div>
              <div>
                Kniha jízd: Start jízdy → Stop jízdy. Km se spočítají automaticky. Když byla objížďka, jde to ručně upravit.
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-neutral-50 p-4">
            <div className="text-sm font-semibold text-neutral-900">Admin – co nastavit</div>
            <div className="mt-2 space-y-2">
              <div>V Adminu si založíš stavby, nastavíš GPS bod a radius (typicky 100–300 m).</div>
              <div>V Adminu vytvoříš uživatele (jméno + PIN) a PIN jim pošleš.</div>
              <div>Dočasné stavby z terénu se objeví v admin části – zkontroluješ a aktivuješ.</div>
              <div>V docházce/vyplácení vidíš práci, km, materiál, částky, označíš zaplaceno a exportuješ CSV.</div>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-4 text-xs text-neutral-600">
            Tip pro zápis “co se dělalo”: piš věcně. Klidně ve stylu “co + kde + počet”.
            Příklad: “Zásuvky – kuchyň 7 ks; kabely – 2 okruhy; světla 1.NP 6 ks; rozvaděč – zapojení”.
          </div>
        </div>
      </div>
    </main>
  );
}
