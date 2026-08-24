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
 * Tokennya dipasang manual lewat setSession, bukan diserahkan ke deteksi
 * otomatis (detectSessionInUrl). @supabase/ssr mengunci klien ke flowType
 * "pkce", dan auth-js menolak token fragment begitu flow-nya pkce
 * ("Not a valid PKCE flow url"): tokennya sampai ke halaman lalu dibuang
 * diam-diam, dan layar hanya bilang tautannya kedaluwarsa.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = createClient();
  const [gagal, setGagal] = useState(false);
  // Isi fragment saat gagal. Tanpa ini layar gagal tidak bisa membedakan
  // "token tidak pernah sampai ke halaman" dari "token sampai tapi tidak
  // jadi sesi" — dua masalah dengan perbaikan yang sama sekali berbeda.
  const [rincian, setRincian] = useState<string>("");

  useEffect(() => {
    // Alur PKCE menaruh kodenya di query (?code=...), bukan fragment.
    // Penukarannya harus di server: cookie sesi hasil exchangeCodeForSession
    // baru terbaca proxy kalau di-set dari sana, dan code_verifier (kalau
    // ada) memang tersimpan sebagai cookie. Rute /auth/confirm sudah
    // melakukannya, jadi teruskan apa adanya alih-alih menduplikasi.
    const query = new URLSearchParams(window.location.search);
    if (query.get("code")) {
      window.location.replace(`/auth/confirm${window.location.search}`);
      return;
    }

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

    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");

    let batal = false;

    (async () => {
      if (!accessToken || !refreshToken) {
        const kunci = [...hash.keys()];
        setRincian(
          kunci.length === 0
            ? "URL tidak membawa token sama sekali."
            : `URL membawa: ${kunci.join(", ")} — tanpa token sesi yang lengkap.`
        );
        setGagal(true);
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (batal) return;

      if (error) {
        setRincian(error.message);
        setGagal(true);
        return;
      }

      // Token dihapus dari URL supaya tidak ikut tersimpan di riwayat
      // browser atau tersalin saat alamatnya dibagikan.
      window.history.replaceState(null, "", window.location.pathname);
      router.replace(tujuan);
    })();

    return () => {
      batal = true;
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
            {rincian && (
              <p className="mb-4 break-words text-xs text-[var(--tinta-soft)]">{rincian}</p>
            )}
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
