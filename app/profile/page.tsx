"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "@/components/ThemeToggle";

export default function ProfilePage() {
  const supabase = createClient();
  const [chatId, setChatId] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [passwordBaru, setPasswordBaru] = useState("");
  const [konfirmasiPassword, setKonfirmasiPassword] = useState("");
  const [errorPassword, setErrorPassword] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordTersimpan, setPasswordTersimpan] = useState(false);

  useEffect(() => {
    async function muat() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      setEmail(userData.user.email || "");

      const { data: profile } = await supabase
        .from("profiles")
        .select("telegram_chat_id")
        .eq("id", userData.user.id)
        .single();

      if (profile?.telegram_chat_id) setChatId(profile.telegram_chat_id);
      setLoading(false);
    }
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSimpan(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const { error } = await supabase
      .from("profiles")
      .update({ telegram_chat_id: chatId })
      .eq("id", userData.user.id);

    setSaving(false);
    if (!error) setSaved(true);
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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[var(--tinta-soft)]">
        Memuat…
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 flex items-center justify-between">
          <Link
            href="/dashboard"
            className="inline-block text-sm text-[var(--tinta-soft)] transition hover:text-[var(--soga)]"
          >
            ← Kembali
          </Link>
          <ThemeToggle />
        </div>

        <p className="label-arsip mb-2">Profil</p>
        <h1
          style={{ fontFamily: "var(--font-display)" }}
          className="mb-1 text-[28px] font-medium tracking-tight text-[var(--tinta)]"
        >
          {email}
        </h1>

        <form onSubmit={handleSimpan} className="kartu-kain mt-8 px-7 py-7">
          <p className="label-arsip mb-2">Notifikasi Telegram</p>
          <p className="mb-5 text-sm text-[var(--tinta-soft)]">
            Chat bot kamu, kirim <code className="bg-[var(--kain-dim)] px-1.5 py-0.5">/start</code>,
            lalu buka{" "}
            <code className="bg-[var(--kain-dim)] px-1.5 py-0.5">
              api.telegram.org/bot&lt;TOKEN&gt;/getUpdates
            </code>{" "}
            untuk melihat chat ID kamu.
          </p>

          <input
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="contoh: 123456789"
            className="w-full border border-[var(--line)] bg-[var(--input-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--soga)]"
          />

          <div className="mt-5 flex items-center gap-4">
            <button
              type="submit"
              disabled={saving}
              className="bg-[var(--soga)] px-5 py-2.5 text-sm font-medium text-[var(--kain)] transition hover:bg-[var(--soga-deep)] disabled:opacity-50"
            >
              {saving ? "Menyimpan…" : "Simpan"}
            </button>
            {saved && <span className="text-sm text-[var(--indigo)]">Tersimpan.</span>}
          </div>
        </form>

        <form onSubmit={handleGantiPassword} className="kartu-kain mt-6 px-7 py-7">
          <p className="label-arsip mb-2">Ganti Kata Sandi</p>
          <p className="mb-5 text-sm text-[var(--tinta-soft)]">
            Pastikan kata sandi baru mudah kamu ingat tapi sulit ditebak orang lain.
          </p>

          <div className="space-y-4">
            <div>
              <label className="label-arsip mb-2 block !text-[10px]">Kata sandi baru</label>
              <input
                type="password"
                value={passwordBaru}
                onChange={(e) => setPasswordBaru(e.target.value)}
                placeholder="Minimal 6 karakter"
                className="w-full border border-[var(--line)] bg-[var(--input-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--soga)]"
              />
            </div>
            <div>
              <label className="label-arsip mb-2 block !text-[10px]">Konfirmasi kata sandi</label>
              <input
                type="password"
                value={konfirmasiPassword}
                onChange={(e) => setKonfirmasiPassword(e.target.value)}
                placeholder="Ulangi kata sandi baru"
                className="w-full border border-[var(--line)] bg-[var(--input-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--soga)]"
              />
            </div>
          </div>

          {errorPassword && (
            <p className="mt-4 border-l-2 border-[var(--bata)] bg-[var(--bata-bg)] px-3 py-2 text-sm text-[var(--bata)]">
              {errorPassword}
            </p>
          )}

          <div className="mt-5 flex items-center gap-4">
            <button
              type="submit"
              disabled={savingPassword}
              className="bg-[var(--soga)] px-5 py-2.5 text-sm font-medium text-[var(--kain)] transition hover:bg-[var(--soga-deep)] disabled:opacity-50"
            >
              {savingPassword ? "Menyimpan…" : "Ganti kata sandi"}
            </button>
            {passwordTersimpan && (
              <span className="text-sm text-[var(--indigo)]">Kata sandi berhasil diubah.</span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
