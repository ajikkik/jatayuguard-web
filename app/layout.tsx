import type { Metadata } from "next";
import "./globals.css";
import IdleTimeout from "@/components/IdleTimeout";

export const metadata: Metadata = {
  title: "JatayuGuard",
  description: "Monitoring suhu & kelembapan multi-device untuk penyimpanan batik",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="bg-kain-bertekstur">
        <IdleTimeout />
        {children}
      </body>
    </html>
  );
}
