"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Pendaratan tautan email versi fragment (#access_token=...).
 *
 * Template email bawaan Supabase memakai {{ .ConfirmationURL }} yang mampir ke
 * /auth/v1/verify dulu, lalu melempar ke Site URL dengan token di fragment URL.
 * Fragment tidak pernah dikirim ke server, jadi /auth/confirm (route handler)
 * tidak bisa membacanya — halaman client inilah yang menanganinya.
 *
 * Supabase client memproses fragment itu sendiri saat dibuat
 * (detectSessionInUrl), yang perlu dilakukan di sini hanya menunggu sesinya
 * jadi lalu mengarahkan sesuai jenis tautan.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = createClient();
  const [gagal, setGagal] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const tipe = hash.get("type");
    const tujuan =
      tipe === "invite" || tipe === "recovery"
        ? `/reset-password?tipe=${tipe}`
        : "/dashboard";

    // Sebab penolakan ikut dibawa: "otp_expired" (kedaluwarsa atau sudah
    // dipakai) dan "access_denied" butuh penanganan berbeda dari sisi
    // pengelola, jadi jangan disamarkan jadi satu pesan.
    const sebab = hash.get("error_code") ?? hash.get("error");
    if (sebab || hash.get("error_description")) {
      const pesan = hash.get("error_description") ?? "";
      router.replace(
        `/reset-password?tipe=${tipe ?? "recovery"}&status=kedaluwarsa` +
          `&sebab=${encodeURIComponent(sebab ?? "")}&pesan=${encodeURIComponent(pesan)}`
      );
      return;
    }

    let selesai = false;
    const lanjut = () => {
      if (selesai) return;
      selesai = true;
      router.replace(tujuan);
    };

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) lanjut();
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) lanjut();
    });

    // Tidak ada sesi setelah beberapa detik: tautannya memang tidak sah.
    const timeout = setTimeout(() => {
      if (!selesai) setGagal(true);
    }, 4000);

    return () => {
      listener.subscription.unsubscribe();
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="kartu-kain px-8 py-9 text-center">
        {gagal ? (
          <>
            <p className="mb-4 text-sm text-[var(--bata)]">
              Tautan tidak valid atau sudah kedaluwarsa.
            </p>
            <a href="/login" className="text-sm text-[var(--soga)] underline">
              Kembali ke halaman masuk
            </a>
          </>
        ) : (
          <p role="status" className="text-sm text-[var(--tinta-soft)]">
            Memeriksa tautan…
          </p>
        )}
      </div>
    </div>
  );
}
