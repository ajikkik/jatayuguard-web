// ======================================================
// EDGE FUNCTION: test-telegram
// Dipanggil dari halaman Profil oleh user yang sedang login, untuk
// membuktikan bahwa notifikasi benar-benar sampai ke Telegram-nya.
//
// Kenapa harus edge function, bukan route handler di aplikasi Next:
// fungsi ini berjalan di runtime, dengan secret, dan memakai TOKEN BOT
// yang SAMA PERSIS dengan notify-telegram dan check-offline-devices.
// Kalau uji ini berhasil, jalur alert yang sesungguhnya memang sehat.
// Menguji lewat jalur lain hanya membuktikan chat ID-nya benar.
//
// Pesannya sengaja ditulis sebagai UJI, bukan alarm palsu — mengirim
// "KONDISI KRITIS" bohong hanya melatih orang untuk mengabaikan alarm.
// ======================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;

// Dipanggil dari browser, jadi preflight CORS harus dilayani. Fungsi lain
// tidak butuh ini karena dipicu webhook/cron dari sisi server.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jawab(badan: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(badan), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/**
 * Telegram memberi alasan kegagalan yang cukup spesifik. Menerjemahkannya
 * adalah inti nilai fitur ini — "gagal" saja tidak membantu siapa pun.
 */
function terjemahkanGalat(deskripsi: string): string {
  const d = deskripsi.toLowerCase();

  if (d.includes("chat not found")) {
    return "Chat ID tidak ditemukan. Pastikan angkanya benar, dan kamu sudah menekan Start di bot Telegram-nya minimal sekali.";
  }
  if (d.includes("bot was blocked")) {
    return "Bot diblokir di Telegram-mu. Buka chat bot itu lalu pilih Unblock.";
  }
  if (d.includes("unauthorized")) {
    return "Token bot ditolak Telegram. Secret TELEGRAM_BOT_TOKEN kemungkinan salah atau sudah dicabut.";
  }
  if (d.includes("too many requests")) {
    return "Telegram sedang membatasi permintaan. Coba lagi sebentar lagi.";
  }
  return `Telegram menolak pesannya: ${deskripsi}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jawab({ ok: false, pesan: "Perlu masuk terlebih dahulu." }, 401);
    }

    // Client memakai JWT milik pemanggil, sehingga RLS tetap berlaku dan
    // seseorang tidak bisa menguji chat ID milik orang lain.
    const supabase = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: errUser,
    } = await supabase.auth.getUser();

    if (errUser || !user) {
      return jawab({ ok: false, pesan: "Sesi tidak valid. Masuk ulang lalu coba lagi." }, 401);
    }

    // Halaman Profil menguji SATU chat tertentu (tiap baris punya tombol
    // ujinya sendiri), jadi chat_id ikut dikirim di body. Tanpa itu — mis.
    // dari klien lama — chat pertama yang terdaftar yang diuji.
    let chatDiminta: string | null = null;
    try {
      const body = await req.json();
      if (body && body.chat_id != null) chatDiminta = String(body.chat_id);
    } catch {
      // Body kosong itu sah; artinya "uji chat mana pun yang ada".
    }

    // Difilter ke user.id, bukan hanya ke chat_id: policy SELECT-nya
    // terbuka untuk seluruh tim, sehingga tanpa filter ini seseorang bisa
    // memancing pesan uji ke chat Telegram milik rekannya.
    let kueri = supabase
      .from("telegram_chats")
      .select("chat_id, label")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (chatDiminta) kueri = kueri.eq("chat_id", chatDiminta);

    const { data: chats, error: errChats } = await kueri;

    if (errChats) {
      return jawab({ ok: false, pesan: "Gagal membaca daftar chat. Coba lagi." }, 502);
    }

    if (!chats || chats.length === 0) {
      return jawab({
        ok: false,
        pesan: chatDiminta
          ? "Chat ID itu tidak terdaftar di akunmu. Muat ulang halaman lalu coba lagi."
          : "Belum ada chat Telegram terdaftar. Tambahkan chat ID dulu, baru kirim uji.",
      });
    }

    const chatId = chats[0].chat_id;

    const waktu = new Date().toLocaleString("id-ID", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Asia/Jakarta",
    });

    const pesan =
      `✅ *Uji koneksi JatayuGuard*\n\n` +
      `Kalau kamu menerima pesan ini, peringatan dari JatayuGuard akan sampai ke sini.\n\n` +
      `_Ini pesan uji, bukan alarm. Tidak ada alat yang sedang bermasalah._\n` +
      `Dikirim ${waktu} WIB.`;

    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: pesan, parse_mode: "Markdown" }),
    });

    const hasil = await res.json();

    if (!hasil.ok) {
      console.error("Uji Telegram gagal:", hasil);
      return jawab({
        ok: false,
        pesan: terjemahkanGalat(String(hasil.description ?? "alasan tidak diketahui")),
      });
    }

    return jawab({
      ok: true,
      pesan: "Pesan uji terkirim. Periksa Telegram-mu sekarang.",
    });
  } catch (err) {
    console.error("Error di test-telegram:", err);
    return jawab({ ok: false, pesan: "Terjadi kesalahan tak terduga di server." }, 500);
  }
});
