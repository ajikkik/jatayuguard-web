"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const BATAS_PERCOBAAN = 5;
const DURASI_KUNCI_MS = 60_000; // 1 menit

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [percobaanGagal, setPercobaanGagal] = useState(0);
  const [terkunciSampai, setTerkunciSampai] = useState<number | null>(null);
  const [sisaDetik, setSisaDetik] = useState(0);

  // Hitung mundur saat akun sementara terkunci
  useEffect(() => {
    if (!terkunciSampai) return;
    const interval = setInterval(() => {
      const sisa = Math.ceil((terkunciSampai - Date.now()) / 1000);
      if (sisa <= 0) {
        setTerkunciSampai(null);
        setPercobaanGagal(0);
        setSisaDetik(0);
      } else {
        setSisaDetik(sisa);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [terkunciSampai]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    // Jangan proses kalau masih dalam masa kunci
    if (terkunciSampai && Date.now() < terkunciSampai) return;

    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      const percobaanBaru = percobaanGagal + 1;
      setPercobaanGagal(percobaanBaru);

      if (percobaanBaru >= BATAS_PERCOBAAN) {
        setTerkunciSampai(Date.now() + DURASI_KUNCI_MS);
        setError(
          `Terlalu banyak percobaan gagal. Coba lagi dalam ${DURASI_KUNCI_MS / 1000} detik.`
        );
      } else {
        setError(
          `Email atau kata sandi tidak cocok. (${BATAS_PERCOBAAN - percobaanBaru} percobaan lagi sebelum dikunci sementara)`
        );
      }
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  const sedangTerkunci = !!terkunciSampai && sisaDetik > 0;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-[400px]">
        {/* Eyebrow + nama produk */}
        <div className="mb-8 text-center">
          <p className="label-arsip mb-2">Arsip Suhu &amp; Kelembapan</p>
          <h1
            style={{ fontFamily: "var(--font-display)" }}
            className="text-[34px] font-medium tracking-tight text-[var(--tinta)]"
          >
            JatayuGuard
          </h1>
        </div>

        {/* Form dengan border ganda ala label kain */}
        <div className="kartu-kain px-8 py-9">
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="label-arsip mb-2 block">Surel</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-[var(--line)] bg-white px-4 py-2.5 text-[15px] text-[var(--tinta)] outline-none transition focus:border-[var(--soga)]"
                placeholder="nama@perusahaan.com"
              />
            </div>

            <div>
              <label className="label-arsip mb-2 block">Kata sandi</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-[var(--line)] bg-white px-4 py-2.5 text-[15px] text-[var(--tinta)] outline-none transition focus:border-[var(--soga)]"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="border-l-2 border-[var(--bata)] bg-[var(--bata-bg)] px-3 py-2 text-sm text-[var(--bata)]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || sedangTerkunci}
              className="w-full bg-[var(--soga)] py-3 text-[15px] font-medium text-[var(--kain)] transition hover:bg-[var(--soga-deep)] disabled:opacity-50"
            >
              {sedangTerkunci
                ? `Coba lagi dalam ${sisaDetik}s`
                : loading
                ? "Memeriksa…"
                : "Masuk"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-[var(--tinta-soft)]">
          Akses diberikan oleh pengelola sistem
        </p>
      </div>
    </div>
  );
}
