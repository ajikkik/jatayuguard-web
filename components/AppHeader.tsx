"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "@/components/ThemeToggle";
import { IkonKeluar, IkonOrang, IkonPanahKiri } from "@/components/Ikon";

type Props = {
  eyebrow: string;
  judul: string;
  /** Tautan kembali di kiri baris atas; kosongkan untuk halaman puncak. */
  kembali?: { href: string; label: string };
};

/**
 * Satu header untuk semua halaman terautentikasi.
 *
 * Sebelumnya tiap halaman menulis headernya sendiri dengan penempatan
 * berbeda-beda — dashboard menaruh tombol di dalam header, halaman detail
 * dan profil di baris terpisah — sehingga posisi navigasi berpindah-pindah
 * tergantung halaman. Sekarang letaknya tetap, dan Profil/Keluar tetap
 * terjangkau dari halaman sedalam apa pun.
 */
export default function AppHeader({ eyebrow, judul, kembali }: Props) {
  const supabase = createClient();
  const pathname = usePathname();
  const diProfil = pathname === "/profile";

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    // Satu baris: judul kiri, navigasi kanan. Susunan dua tingkat sebelumnya
    // menghabiskan 165px (25% viewport laptop) sebelum satu data pun terlihat.
    <header className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-[var(--line)] pb-4">
      <div className="flex min-w-0 items-center gap-3">
        {kembali && (
          <Link
            href={kembali.href}
            aria-label={`Kembali ke ${kembali.label}`}
            className="-ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center text-[var(--tinta-soft)] transition hover:text-[var(--soga)]"
          >
            <IkonPanahKiri ukuran={18} />
          </Link>
        )}
        <div className="min-w-0">
          <p className="label-arsip !text-[10px]">{eyebrow}</p>
          <h1 className="judul truncate text-[22px] leading-tight text-[var(--tinta)]">{judul}</h1>
        </div>
      </div>

      <nav aria-label="Navigasi utama" className="flex items-center gap-2">
        <ThemeToggle />
        {!diProfil && (
          <Link
            href="/profile"
            className="inline-flex h-11 items-center gap-2 border border-[var(--line)] px-4 text-sm text-[var(--tinta)] transition hover:border-[var(--soga)] hover:text-[var(--soga)]"
          >
            <IkonOrang />
            Profil saya
          </Link>
        )}
        <button
          onClick={handleLogout}
          className="inline-flex h-11 items-center gap-2 border border-[var(--line)] px-4 text-sm text-[var(--tinta)] transition hover:border-[var(--soga)] hover:text-[var(--soga)]"
        >
          <IkonKeluar />
          Keluar
        </button>
      </nav>
    </header>
  );
}
