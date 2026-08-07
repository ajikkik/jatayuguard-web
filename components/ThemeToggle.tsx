"use client";

import { useEffect, useState } from "react";
import { IkonBulan, IkonMatahari } from "@/components/Ikon";

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
    return <div className="h-11 w-11" />;
  }

  return (
    <button
      onClick={toggleTema}
      aria-label={tema === "dark" ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
      className="flex h-11 w-11 items-center justify-center border border-[var(--line)] text-[var(--tinta)] transition hover:border-[var(--soga)] hover:text-[var(--soga)]"
    >
      {tema === "dark" ? <IkonMatahari /> : <IkonBulan />}
    </button>
  );
}
