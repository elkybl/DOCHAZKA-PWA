"use client";

import Link from "next/link";

function Manual() {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <details>
        <summary className="cursor-pointer select-none text-sm font-semibold text-neutral-800">
          Manuál (klikni) – návod pro zaměstnance i admina
        </summary>

        <div className="mt-4 space-y-6 text-sm text-neutral-700">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900">Co to je</h3>
            <p className="mt-2">
              Aplikace slouží k evidenci práce na stavbách:
              <b> příchod/odchod</b> přes GPS (jen u stavby), záznam <b>mimo stavbu</b> (nákup, sklad),
              a evidenci <b>kilometrů</b> a <b>materiálu ze svého</b>. Admin pak vidí přehled, spočítá částky a označí
              dny jako <b>Zaplaceno</b>.
            </p>
          </div>

          <div className="h-px bg-neutral-200" />

          <div>
            <h3 className="text-sm font-semibold text-neutral-900">Zaměstnanec – krok za krokem</h3>

            <div className="mt-3 space-y-4">
              <div>
                <div className="text-xs font-semibold text-neutral-700">1) Přihlášení</div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Otevři odkaz (nebo ikonu na ploše) → klikni <b>Přihlásit</b>.</li>
                  <li>Zadej svůj <b>PIN</b> (dostaneš od admina).</li>
                </ul>
              </div>

              <div>
                <div className="text-xs font-semibold text-neutral-700">2) Příchod (začátek práce na stavbě)</div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Vyber <b>Stavbu</b> → klikni <b>PŘÍCHOD</b>.</li>
                  <li>Povol GPS (nejlépe “Při používání” + zapnout “Přesná poloha”).</li>
                  <li>Příchod funguje jen v <b>radiusu</b> stavby (např. 100–300 m).</li>
                </ul>
                <div className="mt-2 rounded-xl border bg-neutral-50 p-3 text-xs text-neutral-700">
                  Když příchod nejde: nejčastěji je vypnutá GPS / nepřesná poloha / jsi mimo radius.
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-neutral-700">3) Odchod (konec práce)</div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Vyplň <b>Co se dělalo</b> (povinné, konkrétně).</li>
                  <li>Volitelně doplň <b>Km</b> a <b>Materiál ze svého</b> (popis + částka).</li>
                  <li>Klikni <b>ODCHOD</b>.</li>
                </ul>

                <div className="mt-2 rounded-xl border bg-neutral-50 p-3">
                  <div className="text-xs font-semibold text-neutral-700">Jak psát “Co se dělalo”</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                    <li>Piš: <b>co + kde + počet/rozsah</b>.</li>
                    <li>“Montáž zásuvek – kuchyň, 7 ks”</li>
                    <li>“Tahání CYKY – 2 okruhy do rozvaděče”</li>
                    <li>“Montáž světel – 1.NP, 6 ks”</li>
                  </ul>
                </div>

                <div className="mt-2 rounded-xl border bg-neutral-50 p-3">
                  <div className="text-xs font-semibold text-neutral-700">Jak psát materiál ze svého</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                    <li>“WAGO 221, 180 Kč”</li>
                    <li>“Vruty + hmoždinky, 95 Kč”</li>
                    <li>“Páska + smršťovačky, 120 Kč”</li>
                  </ul>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-neutral-700">4) Mimo stavbu (nákup / sklad / vyřízení)</div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Když nejsi na stavbě (nákup, sklad…), použij <b>Mimo stavbu</b>.</li>
                  <li>Vyplň <b>Důvod</b> + <b>Hodiny</b> (např. 1.5) a případně materiál.</li>
                </ul>
              </div>

              <div>
                <div className="text-xs font-semibold text-neutral-700">5) Moje výdělek / Moje sazby / Upravit záznamy</div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li><b>Moje výdělek</b>: přehled po dnech (hodiny, sazba, km, materiál, celkem, zaplaceno/ne).</li>
                  <li><b>Moje sazby</b>: nastavíš default sazby a sazby pro konkrétní stavby.</li>
                  <li><b>Upravit záznamy</b>: opravíš texty/částky (nejde měnit čas a polohu).</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="h-px bg-neutral-200" />

          <div>
            <h3 className="text-sm font-semibold text-neutral-900">Admin – nastavení a kontrola</h3>

            <div className="mt-3 space-y-4">
              <div>
                <div className="text-xs font-semibold text-neutral-700">1) Stavby</div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Admin → <b>Stavby</b> → Přidat stavbu.</li>
                  <li>Nastav GPS bod (lat/lng) + <b>radius</b> (typicky 100–300 m).</li>
                  <li>Když GPS zlobí, dej radši radius o trochu větší.</li>
                </ul>
              </div>

              <div>
                <div className="text-xs font-semibold text-neutral-700">2) Uživatelé</div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Admin → <b>Uživatelé</b> → Přidat.</li>
                  <li>Jméno + PIN + role (worker/admin).</li>
                  <li>PIN pošli zaměstnanci.</li>
                </ul>
              </div>

              <div>
                <div className="text-xs font-semibold text-neutral-700">3) Docházka (detail) a vyplácení</div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Admin → <b>Docházka (detail)</b>: vidíš rozpis IN→OUT, mimo stavbu, km, materiál a částky.</li>
                  <li>Admin → <b>Vyplácení</b>: souhrny, rychlé uzavření, export CSV.</li>
                  <li>Tlačítko <b>Označit zaplaceno</b> → zaměstnanec uvidí „Zaplaceno“.</li>
                  <li>Když je to omyl/test: v docházce lze smazat <b>celý den</b> (IN/OUT/OFFSITE).</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-amber-50 p-3 text-xs text-amber-900">
            <b>Tip iPhone:</b> Safari → Sdílet → <b>Přidat na plochu</b> (bude to jako aplikace).
          </div>
        </div>
      </details>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="space-y-4">
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h1 className="text-lg font-semibold">Docházka</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Přihlášení a evidence příchod/odchod + mimo stavbu + km + materiál.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/login"
            className="rounded-xl bg-black px-4 py-3 text-sm text-white shadow-sm"
          >
            Přihlásit
          </Link>

          <a
            className="rounded-xl border bg-white px-4 py-3 text-sm shadow-sm"
            href="#manual"
          >
            Zobrazit manuál
          </a>
        </div>

        <div className="mt-4 rounded-xl border bg-amber-50 p-3 text-xs text-amber-900">
          <b>Tip iPhone:</b> Safari → Sdílet → <b>Přidat na plochu</b> (bude to jako aplikace).
        </div>
      </div>

      <div id="manual">
        <Manual />
      </div>
    </main>
  );
}
