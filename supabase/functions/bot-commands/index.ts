// ======================================================
// EDGE FUNCTION: bot-commands
// Menangani command yang dikirim user ke bot Telegram lewat Webhook.
// Berbeda dari notify-telegram (yang kirim notif OTOMATIS saat kritis),
// function ini merespons saat user AKTIF mengetik command ke bot.
//
// Command yang didukung:
//   /start            - sambutan + daftar command
//   /status           - ringkasan status semua device
//   /status <id>      - detail 1 device
//   /listdevice       - daftar semua device_id terdaftar
//   /offline          - device yang tidak kirim data >2 menit
// ======================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
// Secret token untuk memverifikasi request benar-benar dari Telegram,
// bukan dari pihak lain yang mengirim payload palsu ke URL function ini.
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const BATAS_OFFLINE_MS = 2 * 60 * 1000; // sama seperti definisi "online" di dashboard

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
  };
}

type DeviceRow = {
  device_id: string;
  nama: string | null;
  batas_suhu: number;
  batas_kelembapan: number;
  last_seen: string | null;
};

type ReadingRow = {
  device_id: string;
  suhu: number;
  kelembapan: number;
  risk_index: number;
  status: string;
  created_at: string;
};

function isOnline(lastSeen: string | null): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < BATAS_OFFLINE_MS;
}

function formatWaktu(iso: string | null): string {
  if (!iso) return "belum pernah";
  const tanggal = new Date(iso);
  return tanggal.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
}

function emojiStatus(status: string): string {
  if (status === "BAHAYA") return "🔴";
  if (status === "WASPADA") return "🟡";
  return "🟢";
}

async function kirimPesan(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  });
}

// Cari user_id pemilik chat_id ini, berdasarkan apa yang sudah diisi
// di halaman /profile website. Mengembalikan null kalau chat_id ini
// belum terdaftar ke akun manapun.
async function cariOwnerIdDariChatId(chatId: number): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("telegram_chat_id", String(chatId))
    .single();

  return data?.id || null;
}

// Ambil reading TERBARU untuk setiap device_id dalam satu query efisien
async function ambilReadingTerbaru(): Promise<Record<string, ReadingRow>> {
  const { data } = await supabase
    .from("readings")
    .select("device_id, suhu, kelembapan, risk_index, status, created_at")
    .order("created_at", { ascending: false })
    .limit(500); // cukup besar untuk skala 2-5 device, ambil yang terbaru per device

  const latest: Record<string, ReadingRow> = {};
  for (const r of data || []) {
    if (!latest[r.device_id]) latest[r.device_id] = r;
  }
  return latest;
}

async function handleStart(chatId: number) {
  const pesan =
    `👋 *Selamat datang di JatayuGuard Bot*\n\n` +
    `Command yang tersedia:\n` +
    `/status — ringkasan semua device\n` +
    `/status <device_id> — detail 1 device\n` +
    `/listdevice — daftar semua device terdaftar\n` +
    `/offline — device yang sedang offline\n\n` +
    `_Untuk mengubah threshold/konfigurasi, gunakan website._`;
  await kirimPesan(chatId, pesan);
}

async function handleListDevice(chatId: number, ownerId: string) {
  const { data: devices } = await supabase
    .from("devices")
    .select("device_id, nama")
    .eq("owner_id", ownerId)
    .order("device_id");

  if (!devices || devices.length === 0) {
    await kirimPesan(chatId, "Belum ada device yang terdaftar atas akunmu.");
    return;
  }

  const baris = devices
    .map((d) => `• \`${d.device_id}\`${d.nama ? ` — ${d.nama}` : ""}`)
    .join("\n");

  await kirimPesan(chatId, `📋 *Device milikmu:*\n\n${baris}`);
}

async function handleStatusSemua(chatId: number, ownerId: string) {
  const { data: devices } = await supabase
    .from("devices")
    .select("device_id, nama, batas_suhu, batas_kelembapan, last_seen")
    .eq("owner_id", ownerId)
    .order("device_id");

  if (!devices || devices.length === 0) {
    await kirimPesan(chatId, "Belum ada device yang terdaftar atas akunmu.");
    return;
  }

  const readings = await ambilReadingTerbaru();

  const baris = (devices as DeviceRow[]).map((d) => {
    const r = readings[d.device_id];
    const online = isOnline(d.last_seen);
    const namaTampil = d.nama || d.device_id;

    if (!r) {
      return `${online ? "🟢" : "⚪"} *${namaTampil}* — belum ada data`;
    }

    return (
      `${emojiStatus(r.status)} *${namaTampil}* ${online ? "" : "(OFFLINE)"}\n` +
      `   🌡️ ${r.suhu}°C  💧 ${r.kelembapan}%  Risk: ${r.risk_index}`
    );
  });

  await kirimPesan(chatId, `📊 *Status semua device:*\n\n${baris.join("\n\n")}`);
}

async function handleStatusSatu(chatId: number, deviceId: string, ownerId: string) {
  const { data: device } = await supabase
    .from("devices")
    .select("device_id, nama, batas_suhu, batas_kelembapan, last_seen")
    .eq("device_id", deviceId)
    .eq("owner_id", ownerId)
    .single();

  if (!device) {
    await kirimPesan(
      chatId,
      `Device \`${deviceId}\` tidak ditemukan di akunmu. Gunakan /listdevice untuk lihat daftar device milikmu.`
    );
    return;
  }

  const { data: reading } = await supabase
    .from("readings")
    .select("suhu, kelembapan, nilai_ldr, risk_index, status, created_at")
    .eq("device_id", deviceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const online = isOnline(device.last_seen);
  const namaTampil = device.nama || device.device_id;

  if (!reading) {
    await kirimPesan(chatId, `📍 *${namaTampil}*\n\nBelum ada data masuk dari device ini.`);
    return;
  }

  const pesan =
    `${emojiStatus(reading.status)} *${namaTampil}*\n\n` +
    `🌡️ Suhu: ${reading.suhu}°C (limit: ${device.batas_suhu}°C)\n` +
    `💧 Kelembapan: ${reading.kelembapan}% (limit: ${device.batas_kelembapan}%)\n` +
    `🔢 Risk Index: ${reading.risk_index}\n` +
    `🛡️ Status: *${reading.status}*\n` +
    `📡 Koneksi: ${online ? "Online ✅" : "Offline ⚠️"}\n` +
    `🕐 Update terakhir: ${formatWaktu(reading.created_at)}`;

  await kirimPesan(chatId, pesan);
}

async function handleOffline(chatId: number, ownerId: string) {
  const { data: devices } = await supabase
    .from("devices")
    .select("device_id, nama, last_seen")
    .eq("owner_id", ownerId)
    .order("device_id");

  if (!devices || devices.length === 0) {
    await kirimPesan(chatId, "Belum ada device yang terdaftar atas akunmu.");
    return;
  }

  const devicesOffline = devices.filter((d) => !isOnline(d.last_seen));

  if (devicesOffline.length === 0) {
    await kirimPesan(chatId, "✅ Semua device sedang online.");
    return;
  }

  const baris = devicesOffline
    .map((d) => `🔴 *${d.nama || d.device_id}* — terakhir online: ${formatWaktu(d.last_seen)}`)
    .join("\n");

  await kirimPesan(chatId, `⚠️ *Device offline:*\n\n${baris}`);
}

Deno.serve(async (req) => {
  try {
    // Verifikasi request benar-benar dari Telegram, bukan pihak luar
    // yang menebak/menemukan URL function ini.
    const secretHeader = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (secretHeader !== WEBHOOK_SECRET) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    }

    const update: TelegramUpdate = await req.json();
    const message = update.message;

    if (!message || !message.text) {
      return new Response(JSON.stringify({ skipped: "bukan pesan teks" }), { status: 200 });
    }

    const chatId = message.chat.id;
    const teks = message.text.trim();

    // /start tidak butuh ownerId, semua orang boleh lihat pesan sambutan
    if (teks === "/start") {
      await handleStart(chatId);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // Untuk semua command lain, pastikan chat_id ini sudah terdaftar
    // ke salah satu akun lewat halaman /profile di website.
    const ownerId = await cariOwnerIdDariChatId(chatId);

    if (!ownerId) {
      if (teks.startsWith("/")) {
        await kirimPesan(
          chatId,
          "Chat ID ini belum terhubung ke akun manapun. Daftarkan Chat ID kamu lewat halaman *Profil* di website terlebih dahulu."
        );
      }
      return new Response(JSON.stringify({ skipped: "chat_id belum terdaftar" }), { status: 200 });
    }

    if (teks === "/listdevice") {
      await handleListDevice(chatId, ownerId);
    } else if (teks === "/offline") {
      await handleOffline(chatId, ownerId);
    } else if (teks === "/status") {
      await handleStatusSemua(chatId, ownerId);
    } else if (teks.startsWith("/status ")) {
      const deviceId = teks.replace("/status ", "").trim();
      await handleStatusSatu(chatId, deviceId, ownerId);
    } else if (teks.startsWith("/")) {
      await kirimPesan(chatId, "Command tidak dikenali. Ketik /start untuk lihat daftar command.");
    }
    // Pesan tanpa "/" diabaikan saja (tidak perlu dibalas)

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error("Error di bot-commands:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 200 });
  }
});
