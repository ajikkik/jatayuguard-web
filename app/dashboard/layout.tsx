import type { Metadata } from "next";

// Halaman-halamannya "use client" sehingga tidak bisa mengekspor metadata
// sendiri; layout segment inilah tempatnya. Tanpa ini semua tab bertuliskan
// "JatayuGuard" dan tak bisa dibedakan saat dibuka berbarengan.
export const metadata: Metadata = { title: "Ruang Pemantauan" };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
