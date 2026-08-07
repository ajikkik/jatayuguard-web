"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const BATAS_IDLE_MS = 10 * 60 * 1000; // 10 menit
const PERINGATAN_DETIK = 60; // hitung mundur terakhir sebelum benar-benar keluar

// Event yang dianggap sebagai "aktivitas" dari user
const EVENT_AKTIVITAS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];

export default function IdleTimeout() {
  const router = useRouter();
  const supabase = createClient();

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hitungRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tombolRef = useRef<HTMLButtonElement>(null);

  const [peringatan, setPeringatan] = useState(false);
  const [sisa, setSisa] = useState(PERINGATAN_DETIK);

  // Dibaca dari dalam event listener yang dipasang sekali; state biasa akan
  // ter-capture pada nilai lamanya, jadi statusnya dicerminkan ke ref.
  const peringatanRef = useRef(false);
  const resetRef = useRef<() => void>(() => {});

  useEffect(() => {
    async function logoutKarenaIdle() {
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    }

    function bersihkan() {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (hitungRef.current) clearInterval(hitungRef.current);
    }

    function mulaiHitungMundur() {
      peringatanRef.current = true;
      setPeringatan(true);
      setSisa(PERINGATAN_DETIK);

      hitungRef.current = setInterval(() => {
        setSisa((s) => {
          if (s <= 1) {
            bersihkan();
            logoutKarenaIdle();
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }

    function resetTimer() {
      // Saat hitung mundur sudah tampil, gerakan mouse sekecil apa pun tidak
      // boleh membatalkannya diam-diam — user harus menekan tombolnya, supaya
      // dia sadar sesinya nyaris habis.
      if (peringatanRef.current) return;
      bersihkan();
      timerRef.current = setTimeout(mulaiHitungMundur, BATAS_IDLE_MS - PERINGATAN_DETIK * 1000);
    }

    function lanjutkanSesi() {
      peringatanRef.current = false;
      setPeringatan(false);
      bersihkan();
      timerRef.current = setTimeout(mulaiHitungMundur, BATAS_IDLE_MS - PERINGATAN_DETIK * 1000);
    }

    resetRef.current = lanjutkanSesi;

    let sedangMemantau = false;

    function mulaiPantauIdle() {
      if (sedangMemantau) {
        resetTimer();
        return;
      }
      sedangMemantau = true;
      resetTimer();
      EVENT_AKTIVITAS.forEach((event) =>
        window.addEventListener(event, resetTimer, { passive: true })
      );
    }

    function hentikanPantauIdle() {
      sedangMemantau = false;
      peringatanRef.current = false;
      setPeringatan(false);
      bersihkan();
      EVENT_AKTIVITAS.forEach((event) => window.removeEventListener(event, resetTimer));
    }

    // onAuthStateChange lebih andal dibanding getUser() sekali saja,
    // karena ia menunggu Supabase client benar-benar siap membaca
    // session dari cookie, bukan menebak di render pertama yang
    // mungkin terjadi sebelum session selesai disinkronkan.
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        mulaiPantauIdle();
      } else {
        hentikanPantauIdle();
      }
    });

    return () => {
      hentikanPantauIdle();
      listener.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fokus langsung ke tombol begitu peringatan muncul, supaya pengguna
  // keyboard bisa menekan spasi/enter tanpa mencari-cari.
  useEffect(() => {
    if (peringatan) tombolRef.current?.focus();
  }, [peringatan]);

  if (!peringatan) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="judul-idle"
      onKeyDown={(e) => {
        if (e.key === "Escape") resetRef.current();
      }}
    >
      <div className="kartu-kain w-full max-w-[380px] px-8 py-8 text-center">
        <h2 id="judul-idle" className="judul mb-3 text-xl text-[var(--tinta)]">
          Masih di sana?
        </h2>
        <p className="mb-6 text-sm text-[var(--tinta-soft)]">
          Karena tidak ada aktivitas, kamu akan otomatis keluar dalam{" "}
          <strong className="text-[var(--tinta)]" aria-live="polite">
            {sisa} detik
          </strong>
          .
        </p>
        <button
          ref={tombolRef}
          onClick={() => resetRef.current()}
          className="w-full bg-[var(--soga)] py-3 text-[15px] font-medium text-[var(--kain)] transition hover:bg-[var(--soga-deep)]"
        >
          Tetap di sini
        </button>
      </div>
    </div>
  );
}
