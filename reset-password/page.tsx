"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "@/components/ThemeToggle";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [passwordBaru, setPasswordBaru] = useState("");
  const [konfirmasiPassword, setKonfirmasiPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [berhasil, setBerhasil] = useState(false);
  const [statusTautan, setStatusTautan] = useState<"memeriksa" | "valid" | "invalid">("memeriksa");

  useEffect(() => {
    // Supabase mengirim token reset lewat URL fragment (#access_token=...),
    // yang hanya bisa dibaca di sisi browser (client), bukan server.
    // onAuthStateChange akan memunculkan event PASSWORD_RECOVERY begitu
    // Supabase client selesai memproses token tersebut dari URL dan
    // membuat session sementara untuk reset password.
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setStatusTautan("valid");
      } else if (event === "SIGNED_IN" && session) {
        // Beberapa versi Supabase langsung memunculkan SIGNED_IN
        // alih-alih PASSWORD_RECOVERY tergantung konfigurasi, jadi
        // kita anggap valid juga di kasus ini.
        setStatusTautan("valid");
      }
    });

    // Jaga-jaga: kalau setelah beberapa detik tidak ada event sama sekali,
    // berarti tautan memang sudah tidak valid/kedaluwarsa.
    const timeout = setTimeout(() => {
      setStatusTautan((status) => (status === "memeriksa" ? "invalid" : status));
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
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-[400px]">
        <div className="mb-8 text-center">
          <p className="label-arsip mb-2">Arsip Suhu &amp; Kelembapan</p>
          <h1
            style={{ fontFamily: "var(--font-display)" }}
            className="text-[34px] font-medium tracking-tight text-[var(--tinta)]"
          >
            Atur Ulang Sandi
          </h1>
        </div>

        <div className="kartu-kain px-8 py-9">
          {statusTautan === "memeriksa" ? (
            <p className="text-center text-sm text-[var(--tinta-soft)]">Memeriksa tautan…</p>
          ) : statusTautan === "invalid" ? (
            <div className="text-center">
              <p className="mb-4 text-sm text-[var(--bata)]">
                Tautan tidak valid atau sudah kedaluwarsa. Silakan minta tautan reset baru dari halaman masuk.
              </p>
              <a href="/login" className="text-sm text-[var(--soga)] underline">
                Kembali ke halaman masuk
              </a>
            </div>
          ) : berhasil ? (
            <p className="text-center text-sm text-[var(--indigo)]">
              Kata sandi berhasil diubah. Mengalihkan ke ruang pemantauan…
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="label-arsip mb-2 block">Kata sandi baru</label>
                <input
                  type="password"
                  required
                  value={passwordBaru}
                  onChange={(e) => setPasswordBaru(e.target.value)}
                  className="w-full border border-[var(--line)] bg-[var(--input-bg)] px-4 py-2.5 text-[15px] text-[var(--tinta)] outline-none transition focus:border-[var(--soga)]"
                  placeholder="Minimal 6 karakter"
                />
              </div>

              <div>
                <label className="label-arsip mb-2 block">Konfirmasi kata sandi</label>
                <input
                  type="password"
                  required
                  value={konfirmasiPassword}
                  onChange={(e) => setKonfirmasiPassword(e.target.value)}
                  className="w-full border border-[var(--line)] bg-[var(--input-bg)] px-4 py-2.5 text-[15px] text-[var(--tinta)] outline-none transition focus:border-[var(--soga)]"
                  placeholder="Ulangi kata sandi baru"
                />
              </div>

              {error && (
                <p className="border-l-2 border-[var(--bata)] bg-[var(--bata-bg)] px-3 py-2 text-sm text-[var(--bata)]">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[var(--soga)] py-3 text-[15px] font-medium text-[var(--kain)] transition hover:bg-[var(--soga-deep)] disabled:opacity-50"
              >
                {loading ? "Menyimpan…" : "Simpan kata sandi baru"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
