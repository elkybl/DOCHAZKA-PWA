import "./globals.css";

export const metadata = {
  title: "Docházka",
  description: "Docházka přes web",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body className="min-h-screen bg-neutral-50 text-neutral-900">
        <div className="mx-auto max-w-md md:max-w-3xl lg:max-w-6xl p-4">
          {/* App-like shell */}
          <div className="rounded-3xl bg-white/70 p-3 shadow-sm ring-1 ring-black/5 backdrop-blur">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
