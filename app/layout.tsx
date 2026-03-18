export const metadata = {
  title: "Docházka pro firmy",
  description: "Profesionální evidence docházky, práce, kilometrů a materiálu.",
};

import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body className="bg-neutral-50 text-neutral-900">{children}</body>
    </html>
  );
}
