"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "@/components/ThemeToggle";
import KolomSandi from "@/components/KolomSandi";

/**
 * useSearchParams menuntut Suspense di sekelilingnya; tanpa itu Next
 * menolak mem-prerender halaman ini.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <IsiResetPassword />
    </Suspense>
  );
}

function IsiResetPassword() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // "invite" = akun baru yang belum pernah punya sandi, "recovery" = lupa sandi.
  // Hanya mengubah teks; alur teknisnya sama persis.
  const tipe = searchParams.get("tipe") === "invite" ? "invite" : "recovery";
  // /auth/confirm sudah mencoba menukar token dan gagal — tidak ada gunanya
  // menunggu event sesi apa pun lagi.
  const tautanGagal = searchParams.get("status") === "kedaluwarsa";
  // Diteruskan apa adanya dari Supabase supaya kegagalan bisa dibedakan:
  // token kedaluwarsa/sudah dipakai, tautan salah, atau sebab lain.
  const sebabGagal = searchParams.get("sebab");
  const pesanGagal = searchParams.get("pesan");
  const supabase = createClient();

  const [passwordBaru, setPasswordBaru] = useState("");
  const [konfirmasiPassword, setKonfirmasiPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [berhasil, setBerhasil] = useState(false);
  const [statusTautan, setStatusTautan] = useState<"memeriksa" | "valid" | "invalid">(
    tautanGagal ? "invalid" : "memeriksa"
  );

  useEffect(() => {
    if (tautanGagal) return;

    let sudah = false;
    const tandaiValid = () => {
      sudah = true;
      setStatusTautan("valid");
    };

    // Dua jalur bisa membuat sesi di halaman ini:
    // 1. Sesi sudah jadi di server oleh /auth/confirm -> terbaca getSession().
    // 2. Token datang sebagai fragment (#access_token=...) yang diproses
    //    Supabase client di browser -> muncul sebagai event.
    // Eventnya bisa PASSWORD_RECOVERY, SIGNED_IN, atau INITIAL_SESSION
    // tergantung versi dan alur; yang menentukan hanyalah ada tidaknya sesi.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) tandaiValid();
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) tandaiValid();
    });

    // Jaga-jaga: kalau setelah beberapa detik tetap tidak ada sesi,
    // berarti tautan memang sudah tidak valid/kedaluwarsa.
    const timeout = setTimeout(() => {
      if (!sudah) setStatusTautan("invalid");
    }, 3000);

    return () => {
      listener.subscription.unsubscribe();
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (passwordBaru.length < 6) {
      setError("Kata sandi minimal 6 karakter.");
      return;
    }

    if (passwordBaru !== konfirmasiPassword) {
      setError("Konfirmasi kata sandi tidak cocok.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: passwordBaru });
    setLoading(false);

    if (error) {
      setError("Gagal mengubah kata sandi. Tautan mungkin sudah kedaluwarsa, coba minta tautan baru.");
      return;
    }

    setBerhasil(true);
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 2000);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>
      <main id="konten" className="w-full max-w-[400px]">
        <div className="mb-8 text-center">
          <p className="label-arsip mb-2">Arsip Suhu &amp; Kelembapan</p>
          <h1 className="judul text-[34px] tracking-tight text-[var(--tinta)]">
            {tipe === "invite" ? "Buat Kata Sandi" : "Atur Ulang Sandi"}
          </h1>
        </div>

        <div className="kartu-kain px-8 py-9">
          {statusTautan === "memeriksa" ? (
            <p className="text-center text-sm text-[var(--tinta-soft)]">Memeriksa tautan…</p>
          ) : statusTautan === "invalid" ? (
            <div className="text-center">
              <p className="mb-4 text-sm text-[var(--bata)]">
                {tipe === "invite"
                  ? "Tautan undangan tidak valid atau sudah kedaluwarsa. Minta pengelola sistem mengirim undangan baru."
                  : "Tautan tidak valid atau sudah kedaluwarsa. Silakan minta tautan reset baru dari halaman masuk."}
              </p>
              {(sebabGagal || pesanGagal) && (
                <p className="mb-4 text-xs text-[var(--tinta-soft)]">
                  {pesanGagal || sebabGagal}
                  {pesanGagal && sebabGagal ? ` (${sebabGagal})` : ""}
                </p>
              )}
              <a href="/login" className="text-sm text-[var(--soga)] underline">
                Kembali ke halaman masuk
              </a>
            </div>
          ) : berhasil ? (
            <p className="text-center text-sm text-[var(--indigo)]">
              {tipe === "invite"
                ? "Akun siap dipakai. Mengalihkan ke ruang pemantauan…"
                : "Kata sandi berhasil diubah. Mengalihkan ke ruang pemantauan…"}
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {tipe === "invite" && (
                <p className="text-sm text-[var(--tinta-soft)]">
                  Undangan diterima. Buat kata sandi untuk menyelesaikan pendaftaran akunmu.
                </p>
              )}

              <KolomSandi
                id="password-baru"
                label={tipe === "invite" ? "Kata sandi" : "Kata sandi baru"}
                value={passwordBaru}
                onChange={setPasswordBaru}
                autoComplete="new-password"
                placeholder="Minimal 6 karakter"
                petunjuk="Minimal 6 karakter."
                required
              />

              <KolomSandi
                id="konfirmasi-password"
                label="Konfirmasi kata sandi"
                value={konfirmasiPassword}
                onChange={setKonfirmasiPassword}
                autoComplete="new-password"
                placeholder={tipe === "invite" ? "Ulangi kata sandi" : "Ulangi kata sandi baru"}
                required
              />

              {error && (
                <p
                  role="alert"
                  className="border-l-2 border-[var(--bata)] bg-[var(--bata-bg)] px-3 py-2 text-sm text-[var(--bata)]"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[var(--soga)] py-3 text-[15px] font-medium text-[var(--kain)] transition hover:bg-[var(--soga-deep)] disabled:opacity-50"
              >
                {loading
                  ? "Menyimpan…"
                  : tipe === "invite"
                  ? "Buat akun"
                  : "Simpan kata sandi baru"}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
