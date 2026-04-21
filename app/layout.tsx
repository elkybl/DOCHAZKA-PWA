export const metadata = {
  title: "Docházka / Finish",
  description: "Evidence docházky, práce, dopravy, materiálu a výplat.",
};

import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body className="text-slate-950">{children}</body>
    </html>
  );
}
