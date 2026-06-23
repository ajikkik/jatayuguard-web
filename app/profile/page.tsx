"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ProfilePage() {
  const supabase = createClient();
  const [chatId, setChatId] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
        <Link
          href="/dashboard"
          className="mb-8 inline-block text-sm text-[var(--tinta-soft)] transition hover:text-[var(--soga)]"
        >
          ← Kembali
        </Link>

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
            className="w-full border border-[var(--line)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--soga)]"
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
      </div>
    </div>
  );
}
