"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "jatayuguard-theme";

type Tema = "light" | "dark";

function terapkanTema(tema: Tema) {
  document.documentElement.classList.toggle("dark", tema === "dark");
}

function ambilTemaAwal(): Tema {
  // 1. Cek apakah user pernah pilih manual sebelumnya (tersimpan di localStorage)
  const tersimpan = localStorage.getItem(STORAGE_KEY);
  if (tersimpan === "light" || tersimpan === "dark") return tersimpan;

  // 2. Kalau belum pernah pilih, ikuti preferensi sistem perangkat
  const sukaGelap = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return sukaGelap ? "dark" : "light";
}

export default function ThemeToggle() {
  // null di render pertama supaya tidak mismatch dengan server-rendered HTML
  // (server tidak tahu preferensi sistem/localStorage user)
  const [tema, setTema] = useState<Tema | null>(null);

  useEffect(() => {
    const temaAwal = ambilTemaAwal();
    terapkanTema(temaAwal);
    setTema(temaAwal);

    // Kalau user belum pernah pilih manual, tetap ikuti perubahan sistem
    // secara live (misal dia ganti dark mode OS saat web sedang terbuka)
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    function ikutiSistem(e: MediaQueryListEvent) {
      const sudahPilihManual = localStorage.getItem(STORAGE_KEY);
      if (sudahPilihManual) return; // user sudah override, jangan timpa
      const temaBaru: Tema = e.matches ? "dark" : "light";
      terapkanTema(temaBaru);
      setTema(temaBaru);
    }
    mq.addEventListener("change", ikutiSistem);
    return () => mq.removeEventListener("change", ikutiSistem);
  }, []);

  function toggleTema() {
    const temaBaru: Tema = tema === "dark" ? "light" : "dark";
    terapkanTema(temaBaru);
    setTema(temaBaru);
    localStorage.setItem(STORAGE_KEY, temaBaru);
  }

  // Render placeholder netral sebelum tema diketahui, supaya tidak ada
  // layout shift / flash saat hydration selesai
  if (tema === null) {
    return <div className="h-9 w-9" />;
  }

  return (
    <button
      onClick={toggleTema}
      aria-label={tema === "dark" ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
      title={tema === "dark" ? "Mode gelap aktif" : "Mode terang aktif"}
      className="flex h-9 w-9 items-center justify-center border border-[var(--line)] text-[var(--tinta)] transition hover:border-[var(--soga)] hover:text-[var(--soga)]"
    >
      {tema === "dark" ? (
        // Ikon matahari (klik untuk pindah ke terang)
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        // Ikon bulan (klik untuk pindah ke gelap)
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
