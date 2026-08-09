"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import AppHeader from "@/components/AppHeader";
import KolomSandi from "@/components/KolomSandi";
import { IkonKirim } from "@/components/Ikon";

type ChatTelegram = {
  id: string;
  chat_id: string;
  label: string | null;
};

// Chat pribadi Telegram berupa angka positif, grup/channel diawali "-".
const POLA_CHAT_ID = /^-?\d{5,}$/;

export default function ProfilePage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMuat, setErrorMuat] = useState<string | null>(null);

  // Satu akun boleh punya banyak tujuan notifikasi: ponsel kedua, laptop,
  // atau grup regu jaga. Karena itu ini daftar, bukan satu nilai.
  const [chats, setChats] = useState<ChatTelegram[]>([]);
  const [chatIdBaru, setChatIdBaru] = useState("");
  const [labelBaru, setLabelBaru] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorSimpan, setErrorSimpan] = useState<string | null>(null);

  // Status uji dan hapus disimpan PER chat: satu status global akan membuat
  // hasil uji chat A muncul di sebelah chat B.
  const [ujiUntuk, setUjiUntuk] = useState<string | null>(null);
  const [hasilUji, setHasilUji] = useState<Record<string, { ok: boolean; pesan: string }>>({});
  const [konfirmasiHapus, setKonfirmasiHapus] = useState<string | null>(null);
  const [menghapus, setMenghapus] = useState<string | null>(null);

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

      // Difilter ke user sendiri: policy SELECT-nya terbuka untuk seluruh
      // tim (supaya tim bisa melihat siapa dapat notif), jadi tanpa filter
      // ini halaman Profil akan menampilkan chat milik orang lain juga.
      const { data: daftar, error } = await supabase
        .from("telegram_chats")
        .select("id, chat_id, label")
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: true });

      if (error) {
        setErrorMuat("Gagal memuat profil. Periksa koneksi internetmu.");
        setLoading(false);
        return;
      }

      setChats(daftar ?? []);
      setLoading(false);
    }
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleTambahChat(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    setErrorSimpan(null);

    const chatId = chatIdBaru.trim();
    const label = labelBaru.trim();

    if (!POLA_CHAT_ID.test(chatId)) {
      setErrorSimpan(
        "Chat ID hanya berupa angka (grup diawali tanda minus). Salin persis yang dibalas bot."
      );
      return;
    }

    // Dicegat di sini juga, bukan hanya diserahkan ke constraint unik
    // database: pesan "duplicate key" tidak berarti apa-apa bagi pengguna.
    if (chats.some((c) => c.chat_id === chatId)) {
      setErrorSimpan("Chat ID itu sudah ada di daftarmu.");
      return;
    }

    setSaving(true);

    const { data: userData } = await supabase.auth.getUser();

    // Dulu baris ini `return` begitu saja saat sesi hilang, sehingga `saving`
    // tidak pernah dikembalikan ke false dan tombol Simpan macet selamanya.
    if (!userData.user) {
      setSaving(false);
      setErrorSimpan("Sesi berakhir. Silakan masuk kembali.");
      return;
    }

    const { data: baru, error } = await supabase
      .from("telegram_chats")
      .insert({ user_id: userData.user.id, chat_id: chatId, label: label || null })
      .select("id, chat_id, label")
      .single();

    setSaving(false);

    if (error) {
      // Chat ID unik secara global supaya bot tidak ambigu saat memetakan
      // pesan masuk kembali ke sebuah akun.
      setErrorSimpan(
        error.code === "23505"
          ? "Chat ID itu sudah terdaftar di akun lain."
          : "Gagal menyimpan chat ID. Coba lagi."
      );
      return;
    }

    setChats((p) => [...p, baru]);
    setChatIdBaru("");
    setLabelBaru("");
    setSaved(true);
  }

  async function handleHapusChat(id: string) {
    setKonfirmasiHapus(null);
    setMenghapus(id);
    setErrorSimpan(null);

    const { error } = await supabase.from("telegram_chats").delete().eq("id", id);

    setMenghapus(null);

    if (error) {
      setErrorSimpan("Gagal menghapus chat ID. Coba lagi.");
      return;
    }

    setChats((p) => p.filter((c) => c.id !== id));
    setHasilUji((p) => {
      const sisa = { ...p };
      delete sisa[id];
      return sisa;
    });
  }

  async function handleKirimUji(chat: ChatTelegram) {
    setUjiUntuk(chat.id);
    setHasilUji((p) => {
      const sisa = { ...p };
      delete sisa[chat.id];
      return sisa;
    });

    const { data, error } = await supabase.functions.invoke("test-telegram", {
      body: { chat_id: chat.chat_id },
    });

    setUjiUntuk(null);

    if (error) {
      // Fungsi belum di-deploy adalah kegagalan yang paling mungkin di awal,
      // dan pesan mentahnya tidak membantu, jadi disebut eksplisit.
      setHasilUji((p) => ({
        ...p,
        [chat.id]: {
          ok: false,
          pesan:
            "Tidak bisa memanggil fungsi uji. Pastikan edge function 'test-telegram' sudah di-deploy.",
        },
      }));
      return;
    }

    setHasilUji((p) => ({
      ...p,
      [chat.id]: {
        ok: Boolean(data?.ok),
        pesan: data?.pesan ?? "Tidak ada keterangan dari server.",
      },
    }));
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

        <section className="kartu-kain px-7 py-7">
          <h2 className="label-arsip mb-2">Notifikasi Telegram</h2>
          {/* Instruksi lama menyuruh membuka api.telegram.org/bot<TOKEN>/getUpdates
              sendiri — menuntut pengguna tahu token bot, lalu mencari angka di
              tengah JSON, sering dari ponsel. Sekarang botnya yang memberitahu. */}
          <p className="mb-5 text-sm text-[var(--tinta-soft)]">
            Kirim <code className="bg-[var(--kain-dim)] px-1.5 py-0.5">/start</code> ke bot
            Telegram JatayuGuard. Bot akan membalas dengan chat ID kamu — ketuk angkanya
            untuk menyalin, lalu tempel di bawah ini. Kamu boleh mendaftarkan sebanyak
            mungkin tujuan; setiap peringatan dikirim ke semuanya.
          </p>

          {chats.length === 0 ? (
            <p className="mb-5 border-l-2 border-[var(--line)] px-3 py-2 text-sm text-[var(--tinta-soft)]">
              Belum ada chat terdaftar. Selama daftar ini kosong, tidak ada peringatan
              yang dikirim ke Telegram.
            </p>
          ) : (
            <ul className="mb-6 divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {chats.map((chat) => {
                const hasil = hasilUji[chat.id];
                return (
                  <li key={chat.id} className="py-4">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm text-[var(--tinta)]">
                          {chat.label || "Tanpa nama"}
                        </p>
                        <p className="break-all font-mono text-xs text-[var(--tinta-soft)]">
                          {chat.chat_id}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleKirimUji(chat)}
                        disabled={ujiUntuk === chat.id}
                        className="inline-flex h-9 items-center gap-2 border border-[var(--line)] px-3 text-xs text-[var(--tinta)] transition hover:border-[var(--soga)] hover:text-[var(--soga)] disabled:opacity-45"
                      >
                        <IkonKirim ukuran={14} />
                        {ujiUntuk === chat.id ? "Mengirim…" : "Uji"}
                      </button>

                      {/* Hapus dikonfirmasi di tempat, bukan lewat dialog:
                          menghapus tujuan notifikasi berarti membungkam
                          peringatan, dan itu tidak boleh terjadi karena
                          salah ketuk di layar sempit. */}
                      {konfirmasiHapus === chat.id ? (
                        <span className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleHapusChat(chat.id)}
                            disabled={menghapus === chat.id}
                            className="inline-flex h-9 items-center border border-[var(--bata)] px-3 text-xs text-[var(--bata)] transition hover:bg-[var(--bata-bg)] disabled:opacity-45"
                          >
                            {menghapus === chat.id ? "Menghapus…" : "Ya, hapus"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setKonfirmasiHapus(null)}
                            className="text-xs text-[var(--tinta-soft)] underline"
                          >
                            Batal
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setKonfirmasiHapus(chat.id)}
                          className="inline-flex h-9 items-center border border-[var(--line)] px-3 text-xs text-[var(--tinta-soft)] transition hover:border-[var(--bata)] hover:text-[var(--bata)]"
                        >
                          Hapus
                        </button>
                      )}
                    </div>

                    {hasil && (
                      <p
                        role="status"
                        className={`mt-3 border-l-2 px-3 py-2 text-sm ${
                          hasil.ok
                            ? "border-[var(--indigo)] bg-[var(--indigo-bg)] text-[var(--indigo)]"
                            : "border-[var(--bata)] bg-[var(--bata-bg)] text-[var(--bata)]"
                        }`}
                      >
                        {hasil.pesan}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <form onSubmit={handleTambahChat}>
            <h3 className="label-arsip mb-3 !text-[10px]">Tambah chat</h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                {/* Input ini sebelumnya tidak punya label sama sekali — hanya
                    placeholder, yang hilang begitu user mengetik dan tidak
                    dibacakan screen reader. */}
                <label htmlFor="telegram-chat-id" className="label-arsip mb-2 block !text-[10px]">
                  Chat ID Telegram
                </label>
                <input
                  id="telegram-chat-id"
                  inputMode="numeric"
                  value={chatIdBaru}
                  onChange={(e) => setChatIdBaru(e.target.value)}
                  placeholder="contoh: 123456789"
                  className="w-full border border-[var(--line)] bg-[var(--input-bg)] h-11 px-3 text-sm outline-none focus:border-[var(--soga)]"
                />
              </div>

              <div>
                <label htmlFor="telegram-label" className="label-arsip mb-2 block !text-[10px]">
                  Nama penanda (opsional)
                </label>
                <input
                  id="telegram-label"
                  value={labelBaru}
                  onChange={(e) => setLabelBaru(e.target.value)}
                  placeholder="contoh: HP saya, Grup Gudang"
                  className="w-full border border-[var(--line)] bg-[var(--input-bg)] h-11 px-3 text-sm outline-none focus:border-[var(--soga)]"
                />
              </div>
            </div>

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
                {saving ? "Menyimpan…" : "Tambah chat ID"}
              </button>

              {saved && <span className="text-sm text-[var(--indigo)]">Tersimpan.</span>}
            </div>

            <p className="mt-3 text-xs text-[var(--tinta-soft)]">
              Setelah tersimpan, tekan Uji pada barisnya untuk membuktikan pesan
              benar-benar sampai.
            </p>
          </form>
        </section>

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
