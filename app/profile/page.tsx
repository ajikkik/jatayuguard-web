"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import AppHeader from "@/components/AppHeader";
import KolomSandi from "@/components/KolomSandi";
import { IkonKirim } from "@/components/Ikon";

export default function ProfilePage() {
  const supabase = createClient();
  const [chatId, setChatId] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMuat, setErrorMuat] = useState<string | null>(null);
  const [errorSimpan, setErrorSimpan] = useState<string | null>(null);

  // Nilai yang BENAR-BENAR ada di database, terpisah dari isian form.
  // Fungsi uji membaca dari database, jadi menguji saat form belum
  // disimpan akan menguji chat ID yang lama tanpa user menyadarinya.
  const [chatIdTersimpan, setChatIdTersimpan] = useState("");
  const [statusUji, setStatusUji] = useState<"idle" | "mengirim" | "berhasil" | "gagal">("idle");
  const [pesanUji, setPesanUji] = useState<string | null>(null);

  const [passwordBaru, setPasswordBaru] = useState("");
  const [konfirmasiPassword, setKonfirmasiPassword] = useState("");
  const [errorPassword, setErrorPassword] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordTersimpan, setPasswordTersimpan] = useState(false);

  useEffect(() => {
    async function muat() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setErrorMuat("Sesi tidak terbaca. Coba muat ulang halaman.");
        setLoading(false);
        return;
      }

      setEmail(userData.user.email || "");

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("telegram_chat_id")
        .eq("id", userData.user.id)
        .maybeSingle();

      if (error) {
        setErrorMuat("Gagal memuat profil. Periksa koneksi internetmu.");
        setLoading(false);
        return;
      }

      if (profile?.telegram_chat_id) {
        setChatId(profile.telegram_chat_id);
        setChatIdTersimpan(profile.telegram_chat_id);
      }
      setLoading(false);
    }
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSimpan(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setErrorSimpan(null);

    const { data: userData } = await supabase.auth.getUser();

    // Dulu baris ini `return` begitu saja saat sesi hilang, sehingga `saving`
    // tidak pernah dikembalikan ke false dan tombol Simpan macet selamanya.
    if (!userData.user) {
      setSaving(false);
      setErrorSimpan("Sesi berakhir. Silakan masuk kembali.");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ telegram_chat_id: chatId })
      .eq("id", userData.user.id);

    setSaving(false);

    if (error) {
      setErrorSimpan("Gagal menyimpan chat ID. Coba lagi.");
      return;
    }

    setSaved(true);
    setChatIdTersimpan(chatId);
    setStatusUji("idle");
    setPesanUji(null);
  }

  async function handleKirimUji() {
    setStatusUji("mengirim");
    setPesanUji(null);

    const { data, error } = await supabase.functions.invoke("test-telegram");

    if (error) {
      // Fungsi belum di-deploy adalah kegagalan yang paling mungkin di awal,
      // dan pesan mentahnya tidak membantu, jadi disebut eksplisit.
      setStatusUji("gagal");
      setPesanUji(
        "Tidak bisa memanggil fungsi uji. Pastikan edge function 'test-telegram' sudah di-deploy."
      );
      return;
    }

    setStatusUji(data?.ok ? "berhasil" : "gagal");
    setPesanUji(data?.pesan ?? "Tidak ada keterangan dari server.");
  }

  async function handleGantiPassword(e: React.FormEvent) {
    e.preventDefault();
    setErrorPassword(null);
    setPasswordTersimpan(false);

    if (passwordBaru.length < 6) {
      setErrorPassword("Kata sandi minimal 6 karakter.");
      return;
    }

    if (passwordBaru !== konfirmasiPassword) {
      setErrorPassword("Konfirmasi kata sandi tidak cocok.");
      return;
    }

    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: passwordBaru });
    setSavingPassword(false);

    if (error) {
      setErrorPassword("Gagal mengubah kata sandi. Coba lagi.");
      return;
    }

    setPasswordTersimpan(true);
    setPasswordBaru("");
    setKonfirmasiPassword("");
  }

  // Konfirmasi hijau dulu menetap selamanya sampai halaman dimuat ulang,
  // sehingga user tak bisa membedakan hasil simpan barusan dengan yang tadi.
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 4000);
    return () => clearTimeout(t);
  }, [saved]);

  useEffect(() => {
    if (!passwordTersimpan) return;
    const t = setTimeout(() => setPasswordTersimpan(false), 4000);
    return () => clearTimeout(t);
  }, [passwordTersimpan]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-[var(--tinta-soft)]">
        Memuat…
      </div>
    );
  }

  if (errorMuat) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
        <p className="text-[var(--bata)]" role="alert">
          {errorMuat}
        </p>
        <Link href="/dashboard" className="text-sm text-[var(--soga)] underline">
          Kembali ke ruang pemantauan
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-dvh px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-lg">
        <AppHeader
          eyebrow="Akun"
          judul="Profil"
          kembali={{ href: "/dashboard", label: "Ruang pemantauan" }}
        />

        <main id="konten">
        {/* Email adalah keterangan akun, bukan judul halaman — sebelumnya
            alamat email dipasang sebagai <h1>. */}
        <p className="mb-8 text-sm text-[var(--tinta-soft)]">
          Masuk sebagai <span className="text-[var(--tinta)]">{email}</span>
        </p>

        <form onSubmit={handleSimpan} className="kartu-kain px-7 py-7">
          <h2 className="label-arsip mb-2">Notifikasi Telegram</h2>
          <p className="mb-5 text-sm text-[var(--tinta-soft)]">
            Chat bot kamu, kirim <code className="bg-[var(--kain-dim)] px-1.5 py-0.5">/start</code>,
            lalu buka{" "}
            <code className="bg-[var(--kain-dim)] px-1.5 py-0.5">
              api.telegram.org/bot&lt;TOKEN&gt;/getUpdates
            </code>{" "}
            untuk melihat chat ID kamu.
          </p>

          {/* Input ini sebelumnya tidak punya label sama sekali — hanya placeholder,
              yang hilang begitu user mengetik dan tidak dibacakan screen reader. */}
          <label htmlFor="telegram-chat-id" className="label-arsip mb-2 block !text-[10px]">
            Chat ID Telegram
          </label>
          <input
            id="telegram-chat-id"
            inputMode="numeric"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="contoh: 123456789"
            className="w-full border border-[var(--line)] bg-[var(--input-bg)] h-11 px-3 text-sm outline-none focus:border-[var(--soga)]"
          />

          {errorSimpan && (
            <p
              role="alert"
              className="mt-4 border-l-2 border-[var(--bata)] bg-[var(--bata-bg)] px-3 py-2 text-sm text-[var(--bata)]"
            >
              {errorSimpan}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="bg-[var(--soga)] inline-flex h-11 items-center px-5 text-sm font-medium text-[var(--kain)] transition hover:bg-[var(--soga-deep)] disabled:opacity-50"
            >
              {saving ? "Menyimpan…" : "Simpan"}
            </button>

            <button
              type="button"
              onClick={handleKirimUji}
              disabled={!chatIdTersimpan || chatId !== chatIdTersimpan || statusUji === "mengirim"}
              className="inline-flex h-11 items-center gap-2 border border-[var(--line)] px-5 text-sm text-[var(--tinta)] transition hover:border-[var(--soga)] hover:text-[var(--soga)] disabled:opacity-45 disabled:hover:border-[var(--line)] disabled:hover:text-[var(--tinta)]"
            >
              <IkonKirim />
              {statusUji === "mengirim" ? "Mengirim…" : "Kirim pesan uji"}
            </button>

            {saved && <span className="text-sm text-[var(--indigo)]">Tersimpan.</span>}
          </div>

          {/* Alasan tombol uji terkunci harus jelas, bukan dibiarkan menebak. */}
          {!chatIdTersimpan ? (
            <p className="mt-3 text-xs text-[var(--tinta-soft)]">
              Isi dan simpan chat ID dulu sebelum bisa mengirim pesan uji.
            </p>
          ) : chatId !== chatIdTersimpan ? (
            <p className="mt-3 text-xs text-[var(--tinta-soft)]">
              Chat ID berubah tapi belum disimpan. Uji akan memakai nilai yang tersimpan
              ({chatIdTersimpan}) — simpan dulu agar yang diuji nilai yang baru.
            </p>
          ) : null}

          {pesanUji && (
            <p
              role="status"
              className={`mt-4 border-l-2 px-3 py-2 text-sm ${
                statusUji === "berhasil"
                  ? "border-[var(--indigo)] bg-[var(--indigo-bg)] text-[var(--indigo)]"
                  : "border-[var(--bata)] bg-[var(--bata-bg)] text-[var(--bata)]"
              }`}
            >
              {pesanUji}
            </p>
          )}
        </form>

        <form onSubmit={handleGantiPassword} className="kartu-kain mt-6 px-7 py-7">
          <h2 className="label-arsip mb-2">Ganti Kata Sandi</h2>
          <p className="mb-5 text-sm text-[var(--tinta-soft)]">
            Pastikan kata sandi baru mudah kamu ingat tapi sulit ditebak orang lain.
          </p>

          <div className="space-y-4">
            <KolomSandi
              id="password-baru"
              label="Kata sandi baru"
              value={passwordBaru}
              onChange={setPasswordBaru}
              autoComplete="new-password"
              placeholder="Minimal 6 karakter"
              petunjuk="Minimal 6 karakter."
            />
            <KolomSandi
              id="konfirmasi-password"
              label="Konfirmasi kata sandi"
              value={konfirmasiPassword}
              onChange={setKonfirmasiPassword}
              autoComplete="new-password"
              placeholder="Ulangi kata sandi baru"
            />
          </div>

          {errorPassword && (
            <p
              role="alert"
              className="mt-4 border-l-2 border-[var(--bata)] bg-[var(--bata-bg)] px-3 py-2 text-sm text-[var(--bata)]"
            >
              {errorPassword}
            </p>
          )}

          <div className="mt-5 flex items-center gap-4">
            <button
              type="submit"
              disabled={savingPassword}
              className="bg-[var(--soga)] inline-flex h-11 items-center px-5 text-sm font-medium text-[var(--kain)] transition hover:bg-[var(--soga-deep)] disabled:opacity-50"
            >
              {savingPassword ? "Menyimpan…" : "Ganti kata sandi"}
            </button>
            {passwordTersimpan && (
              <span className="text-sm text-[var(--indigo)]">Kata sandi berhasil diubah.</span>
            )}
          </div>
        </form>
        </main>
      </div>
    </div>
  );
}
