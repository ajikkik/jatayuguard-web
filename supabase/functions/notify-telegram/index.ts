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

interface ReadingPayload {
  type: "INSERT";
  table: string;
  record: {
    id: number;
    device_id: string;
    suhu: number | null;
    kelembapan: number | null;
    nilai_ldr: number;
    risk_index: number;
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

    if (reading.suhu == null || reading.kelembapan == null) {
      console.log(`Dilewati: device ${reading.device_id} kirim suhu/kelembapan null (kemungkinan sensor gagal baca).`);
      return new Response(JSON.stringify({ skipped: "suhu/kelembapan null" }), { status: 200 });
    }

    // Hanya proses jika statusnya WASPADA atau BAHAYA. AMAN tidak perlu notif.
    if (reading.status !== "WASPADA" && reading.status !== "BAHAYA") {
      return new Response(JSON.stringify({ skipped: "status aman" }), { status: 200 });
    }

    // Cari device ini: siapa pemiliknya, nama tampilannya, dan threshold-nya
    const { data: device, error: deviceError } = await supabase
      .from("devices")
      .select("nama, owner_id, batas_suhu, batas_kelembapan")
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

    // Cari chat_id Telegram milik owner device ini
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("telegram_chat_id")
      .eq("id", device.owner_id)
      .single();

    if (profileError || !profile?.telegram_chat_id) {
      console.error("Chat ID tidak ditemukan untuk owner:", device.owner_id);
      return new Response(JSON.stringify({ skipped: "chat_id belum diatur" }), { status: 200 });
    }

    // Susun nama tampilan device (pakai nama custom jika ada, fallback ke device_id)
    const namaDevice = device.nama || reading.device_id;

    const header = reading.status === "BAHAYA"
      ? "🚨 *KONDISI KRITIS*"
      : "⚠️ *PERINGATAN WASPADA*";

    const pesan =
      `${header}\n\n` +
      `📍 *Device:* ${namaDevice}\n` +
      `🌡️ Suhu: ${reading.suhu.toFixed(1)}°C (Limit: ${device.batas_suhu}°C)\n` +
      `💧 Kelembapan: ${reading.kelembapan.toFixed(1)}% (Limit: ${device.batas_kelembapan}%)\n` +
      `🔢 Risk Index: ${reading.risk_index}\n` +
      `🛡️ Status: *${reading.status}*`;

    const tgResponse = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: profile.telegram_chat_id,
          text: pesan,
          parse_mode: "Markdown",
        }),
      }
    );

    const tgResult = await tgResponse.json();

    if (!tgResult.ok) {
      console.error("Gagal kirim Telegram:", tgResult);
      return new Response(JSON.stringify({ error: tgResult }), { status: 200 });
    }

    return new Response(JSON.stringify({ success: true, device: namaDevice }), { status: 200 });

  } catch (err) {
    console.error("Error di notify-telegram:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
