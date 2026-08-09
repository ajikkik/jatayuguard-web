// ======================================================
// EDGE FUNCTION: notify-telegram
// Dipicu oleh Database Webhook setiap ada INSERT baru di tabel "readings".
// Model PER-OWNER: notifikasi dikirim HANYA ke owner device yang
// bersangkutan (owner_id di tabel devices), bukan ke semua orang.
// ======================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;

// Service role key dipakai di sini (bukan anon key) karena Edge Function
// berjalan di server tepercaya dan butuh akses lintas-user untuk mencari
// owner_id & chat_id pemilik device tersebut.
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

/**
 * Kirim satu pesan ke satu chat. Mengembalikan true kalau Telegram
 * menerimanya.
 *
 * Markdown lawas Telegram menolak SELURUH pesan kalau ada penanda format
 * yang tidak berpasangan. Nama alat diisi pengguna dan boleh memuat "_"
 * atau "*", jadi satu nama seperti "Lemari_Utara" cukup untuk membungkam
 * peringatan bahaya. Cacat format tidak boleh menghalangi alarm, jadi
 * pesannya dikirim ulang sebagai teks polos.
 */
async function kirimPesan(chatId: string, pesan: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: pesan, parse_mode: "Markdown" }),
    });

    const hasil = await res.json();
    if (hasil.ok) return true;

    const alasan = String(hasil.description ?? "alasan tidak diketahui");

    if (/can't parse entities/i.test(alasan)) {
      console.error(`Markdown ditolak untuk chat ${chatId} (${alasan}). Mengirim ulang sebagai teks polos.`);
      const ulang = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: pesan }),
      });
      const hasilUlang = await ulang.json();
      if (hasilUlang.ok) return true;
      console.error(`Kiriman teks polos juga gagal untuk chat ${chatId}: ${hasilUlang.description}`);
      return false;
    }

    console.error(`Gagal kirim ke chat ${chatId}: ${alasan}`);
    return false;
  } catch (err) {
    console.error(`Gagal menghubungi Telegram untuk chat ${chatId}:`, err);
    return false;
  }
}

interface ReadingPayload {
  type: "INSERT";
  table: string;
  record: {
    id: number;
    device_id: string;
    suhu: number | null;
    kelembapan: number | null;
    nilai_uv: number | null;
    risk_index: number | null;
    status: string;
    created_at: string;
  };
}

Deno.serve(async (req) => {
  try {
    const payload: ReadingPayload = await req.json();
    const reading = payload.record;

    // Validasi dasar: pastikan record dan field penting ada sebelum diproses.
    // Ini mencegah crash jika payload kosong (mis. dari klik tombol "Test"
    // di dashboard) atau jika sensor ESP8266 gagal baca sehingga
    // suhu/kelembapan terkirim sebagai null.
    if (!reading || !reading.device_id) {
      console.log("Dilewati: payload tidak punya record/device_id yang valid.");
      return new Response(JSON.stringify({ skipped: "payload tidak valid" }), { status: 200 });
    }

    // CATATAN: dulu di sini ada penjaga yang MELEWATI pembacaan bila
    // suhu/kelembapan null. Itu ditulis waktu keduanya satu-satunya ukuran.
    // Sejak firmware v2, UV sendirian bisa memicu WASPADA/BAHAYA, sehingga
    // alat yang sensor SHT3x-nya mati tapi UV-nya melewati ambang TIDAK
    // PERNAH mengirim notifikasi sama sekali. Alat berteriak, alert dibuang.
    //
    // Sekarang yang dilewati hanya pembacaan tanpa satu pun nilai ukur.
    if (reading.suhu == null && reading.kelembapan == null && reading.nilai_uv == null) {
      console.log(`Dilewati: device ${reading.device_id} tidak mengirim satu pun nilai ukur.`);
      return new Response(JSON.stringify({ skipped: "tidak ada nilai ukur" }), { status: 200 });
    }

    // Hanya proses jika statusnya WASPADA atau BAHAYA. AMAN tidak perlu notif.
    if (reading.status !== "WASPADA" && reading.status !== "BAHAYA") {
      return new Response(JSON.stringify({ skipped: "status aman" }), { status: 200 });
    }

    // Cari device ini: siapa pemiliknya, nama tampilannya, dan threshold-nya
    const { data: device, error: deviceError } = await supabase
      .from("devices")
      .select("nama, owner_id, batas_suhu, batas_kelembapan, batas_uv")
      .eq("device_id", reading.device_id)
      .single();

    if (deviceError || !device) {
      console.error("Device tidak ditemukan:", reading.device_id);
      return new Response(JSON.stringify({ error: "device tidak ditemukan" }), { status: 200 });
    }

    // Jika device belum di-assign owner-nya, tidak ada yang dikirimi notif
    if (!device.owner_id) {
      console.log(`Dilewati: device ${reading.device_id} belum punya owner.`);
      return new Response(JSON.stringify({ skipped: "device belum punya owner" }), { status: 200 });
    }

    // Satu owner boleh mendaftarkan banyak tujuan Telegram (ponsel kedua,
    // grup regu jaga). Peringatan dikirim ke SEMUANYA — memilih satu saja
    // berarti sebagian penerima yang sengaja didaftarkan tidak diberi tahu.
    const { data: chats, error: chatsError } = await supabase
      .from("telegram_chats")
      .select("chat_id")
      .eq("user_id", device.owner_id);

    if (chatsError) {
      console.error("Gagal membaca daftar chat Telegram:", chatsError);
      return new Response(JSON.stringify({ error: "gagal baca chat" }), { status: 200 });
    }

    if (!chats || chats.length === 0) {
      console.error("Belum ada chat Telegram terdaftar untuk owner:", device.owner_id);
      return new Response(JSON.stringify({ skipped: "chat_id belum diatur" }), { status: 200 });
    }

    // Susun nama tampilan device (pakai nama custom jika ada, fallback ke device_id)
    const namaDevice = device.nama || reading.device_id;

    const header = reading.status === "BAHAYA"
      ? "🚨 *KONDISI KRITIS*"
      : "⚠️ *PERINGATAN WASPADA*";

    // Hanya besaran yang benar-benar terukur yang disebut. Menulis
    // "Suhu: null" lebih membingungkan daripada tidak menyebutnya.
    const barisUkur: string[] = [];
    if (reading.suhu != null) {
      barisUkur.push(`🌡️ Suhu: ${reading.suhu.toFixed(1)}°C (Limit: ${device.batas_suhu ?? "-"}°C)`);
    }
    if (reading.kelembapan != null) {
      barisUkur.push(`💧 Kelembapan: ${reading.kelembapan.toFixed(1)}% (Limit: ${device.batas_kelembapan ?? "-"}%)`);
    }
    if (reading.nilai_uv != null) {
      barisUkur.push(`☀️ UV Index: ${reading.nilai_uv.toFixed(2)} (Limit: ${device.batas_uv ?? "-"})`);
    }

    // Sensor yang mati adalah informasi penting, bukan sekadar ketiadaan:
    // penerima perlu tahu bahwa sebagian pemantauan sedang buta.
    const sensorMati: string[] = [];
    if (reading.suhu == null) sensorMati.push("suhu");
    if (reading.kelembapan == null) sensorMati.push("kelembapan");

    const pesan =
      `${header}\n\n` +
      `📍 *Device:* ${namaDevice}\n` +
      barisUkur.join("\n") +
      `\n🔢 Risk Index: ${reading.risk_index ?? "-"}\n` +
      `🛡️ Status: *${reading.status}*` +
      (sensorMati.length
        ? `\n\n⚠️ Sensor ${sensorMati.join(" dan ")} tidak mengirim nilai. Periksa wiring alat.`
        : "");

    // Satu chat yang bermasalah (bot diblokir, chat dihapus) tidak boleh
    // menghentikan pengiriman ke chat lain, jadi hasilnya dikumpulkan
    // dan tidak ada yang dilempar ke luar.
    const hasilKirim = await Promise.all(
      chats.map((c) => kirimPesan(String(c.chat_id), pesan))
    );
    const terkirim = hasilKirim.filter(Boolean).length;

    if (terkirim === 0) {
      console.error(`Peringatan ${reading.device_id} tidak sampai ke satu pun dari ${chats.length} chat.`);
      return new Response(
        JSON.stringify({ error: "semua pengiriman gagal", tujuan: chats.length }),
        { status: 200 }
      );
    }

    return new Response(
      JSON.stringify({ success: true, device: namaDevice, terkirim, tujuan: chats.length }),
      { status: 200 }
    );

  } catch (err) {
    console.error("Error di notify-telegram:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
