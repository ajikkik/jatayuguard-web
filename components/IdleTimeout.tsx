"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const BATAS_IDLE_MS = 10 * 60 * 1000; // 10 menit

// Event yang dianggap sebagai "aktivitas" dari user
const EVENT_AKTIVITAS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];

export default function IdleTimeout() {
  const router = useRouter();
  const supabase = createClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function logoutKarenaIdle() {
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    }

    function resetTimer() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(logoutKarenaIdle, BATAS_IDLE_MS);
    }

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
      if (timerRef.current) clearTimeout(timerRef.current);
      EVENT_AKTIVITAS.forEach((event) =>
        window.removeEventListener(event, resetTimer)
      );
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

  // Komponen ini tidak menampilkan apapun, cuma menjalankan logic di background
  return null;
}
