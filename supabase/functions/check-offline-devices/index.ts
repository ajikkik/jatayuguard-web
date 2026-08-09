// ======================================================
// EDGE FUNCTION: check-offline-devices
// Dijalankan TERJADWAL (via pg_cron) setiap beberapa menit,
// BUKAN dipicu oleh event tertentu seperti function lainnya.
//
// Tugas: cek semua device, kalau last_seen sudah lebih dari
// BATAS_OFFLINE_MENIT menit yang lalu, kirim alert ke owner-nya.
// Maksimal MAKS_ALERT kali per periode offline (supaya tidak spam),
// lalu jumlah_alert_offline otomatis reset ke 0 saat device online lagi
// (lewat trigger database di tabel readings).
// ======================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const BATAS_OFFLINE_MENIT = 10;
const MAKS_ALERT = 2;

type DeviceRow = {
  device_id: string;
  nama: string | null;
  owner_id: string | null;
  last_seen: string | null;
  jumlah_alert_offline: number;
};

function menitSejak(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

/** Mengembalikan true kalau Telegram benar-benar menerima pesannya. */
async function kirimPesan(chatId: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });

    const hasil = await res.json();
    if (hasil.ok) return true;

    const alasan = String(hasil.description ?? "alasan tidak diketahui");

    // Markdown lawas Telegram menolak SELURUH pesan kalau ada penanda
    // format yang tidak berpasangan. Itu mudah terjadi tanpa disengaja:
    // nama alat diisi pengguna dan boleh mengandung "_" atau "*".
    // Cacat format tidak boleh sampai membungkam peringatan, jadi kalau
    // penyebabnya parsing, pesannya dikirim ulang sebagai teks polos.
    if (/can't parse entities/i.test(alasan)) {
      console.error(`Markdown ditolak untuk chat ${chatId} (${alasan}). Mengirim ulang sebagai teks polos.`);
      const ulang = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
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

Deno.serve(async (req) => {
  try {
    const { data: devices, error } = await supabase
      .from("devices")
      .select("device_id, nama, owner_id, last_seen, jumlah_alert_offline");

    if (error || !devices) {
      console.error("Gagal ambil daftar device:", error);
      return new Response(JSON.stringify({ error: "gagal ambil device" }), { status: 200 });
    }

    let diperiksa = 0;
    let dialert = 0;

    for (const device of devices as DeviceRow[]) {
      diperiksa++;

      // Device belum pernah kirim data sama sekali, atau belum punya owner -> lewati
      if (!device.last_seen || !device.owner_id) continue;

      const menitOffline = menitSejak(device.last_seen);

      // Belum melewati batas waktu offline -> lewati
      if (menitOffline < BATAS_OFFLINE_MENIT) continue;

      // Sudah mencapai batas maksimal alert untuk periode offline ini -> lewati
      if (device.jumlah_alert_offline >= MAKS_ALERT) continue;

      // Owner boleh mendaftarkan banyak tujuan Telegram; alert dikirim
      // ke semuanya.
      const { data: chats } = await supabase
        .from("telegram_chats")
        .select("chat_id")
        .eq("user_id", device.owner_id);

      if (!chats || chats.length === 0) continue;

      const namaTampil = device.nama || device.device_id;
      const keBerapa = device.jumlah_alert_offline + 1;

      const pesan =
        `📡 *KONEKSI TERPUTUS*\n\n` +
        `📍 Device: *${namaTampil}*\n` +
        `⏱️ Tidak ada data sejak ${menitOffline} menit lalu\n` +
        `🔔 Peringatan ke-${keBerapa} dari ${MAKS_ALERT}\n\n` +
        `_Periksa koneksi WiFi atau aliran listrik alat ini._`;

      // Cukup satu tujuan yang berhasil untuk menganggap owner sudah
      // diberi tahu. Menuntut semuanya berhasil berarti satu chat yang
      // memblokir bot akan membuat alert dikirim ulang terus-menerus ke
      // chat lain yang sudah menerimanya.
      const hasilKirim = await Promise.all(
        chats.map((c) => kirimPesan(String(c.chat_id), pesan))
      );
      const terkirim = hasilKirim.some(Boolean);

      // Jatah alert HANYA dipakai kalau pesannya benar-benar sampai.
      // Sebelumnya hitungan dinaikkan tanpa peduli hasil pengiriman, jadi
      // dua kegagalan beruntun menghabiskan jatah MAKS_ALERT dan pemilik
      // tidak akan pernah diberi tahu alatnya mati — kegagalan yang justru
      // membungkam peringatan yang seharusnya paling terdengar.
      if (!terkirim) {
        console.error(`Alert offline untuk ${device.device_id} tidak terkirim, jatah tidak dipakai.`);
        continue;
      }

      dialert++;

      await supabase
        .from("devices")
        .update({ jumlah_alert_offline: keBerapa })
        .eq("device_id", device.device_id);
    }

    return new Response(
      JSON.stringify({ success: true, diperiksa, dialert }),
      { status: 200 }
    );
  } catch (err) {
    console.error("Error di check-offline-devices:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
