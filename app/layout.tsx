import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import IdleTimeout from "@/components/IdleTimeout";

// Font di-self-host oleh next/font: tidak ada permintaan ke Google saat
// halaman dimuat, dan ruang barisnya sudah dicadangkan sehingga heading
// tidak melompat saat font selesai dimuat.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "JatayuGuard",
    template: "%s · JatayuGuard",
  },
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
    <html
      lang="id"
      suppressHydrationWarning
      className={`${fraunces.variable} ${inter.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: skripAntiFlashTema }} />
      </head>
      <body className="bg-kain-bertekstur">
        <a href="#konten" className="lewati-ke-konten">
          Lompat ke konten
        </a>
        <IdleTimeout />
        {children}
      </body>
    </html>
  );
}
