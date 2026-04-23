import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lukáš Kýbl | Docházka Finish",
  description: "Docházka Finish pro evidenci práce, materiálu, dopravy, kalendáře a administrace firmy.",
  icons: {
    icon: "/ekybl-icon.png",
    shortcut: "/ekybl-icon.png",
    apple: "/ekybl-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body className="bg-[#f4f8ff] text-slate-950 antialiased">{children}</body>
    </html>
  );
}
