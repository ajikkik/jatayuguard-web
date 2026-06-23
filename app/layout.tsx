import type { Metadata } from "next";
import "./globals.css";
import IdleTimeout from "@/components/IdleTimeout";

export const metadata: Metadata = {
  title: "JatayuGuard",
  description: "Monitoring suhu & kelembapan multi-device untuk penyimpanan batik",
};

// Script ini sengaja ditulis sebagai string dan disisipkan inline (bukan
// dijalankan lewat useEffect) agar berjalan SEBELUM browser melukis halaman.
// Tanpa ini, akan ada kedipan singkat tema terang sebelum berpindah ke
// gelap setiap kali halaman dimuat ulang.
const skripAntiFlashTema = `
  (function () {
    try {
      var tersimpan = localStorage.getItem('jatayuguard-theme');
      var gelap = tersimpan === 'dark' || (!tersimpan && window.matchMedia('(prefers-color-scheme: dark)').matches);
      if (gelap) document.documentElement.classList.add('dark');
    } catch (e) {}
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: skripAntiFlashTema }} />
      </head>
      <body className="bg-kain-bertekstur">
        <IdleTimeout />
        {children}
      </body>
    </html>
  );
}
