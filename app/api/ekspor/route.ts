import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { angka, barisCsv, berkasCsv, PEMISAH, waktuLokal } from "@/lib/csv";

// Supabase memotong hasil di 1.000 baris per permintaan. Handler ini harus
// mengulang .range() sampai habis — kalau tidak, ekspor sebulan akan
// terpotong diam-diam dan baru ketahuan berbulan-bulan kemudian.
const UKURAN_HALAMAN = 1000;

// Batas keras. Kalau terlampaui kita MENOLAK dengan pesan jelas, bukan
// memotong diam-diam: file yang kelihatan lengkap padahal separuh adalah
// bug yang lebih berbahaya daripada permintaan yang gagal terang-terangan.
const MAKS_BARIS = 100_000;

const KOLOM = [
  "waktu_iso",
  "waktu",
  "device_id",
  "nama_alat",
  "suhu_c",
  "kelembapan_persen",
  "nilai_ldr",
  "indeks_risiko",
  "status",
  "batas_suhu_c",
  "batas_kelembapan_persen",
];

/** "2026-08-07" -> awal/akhir hari. String ISO penuh diteruskan apa adanya. */
function batasWaktu(nilai: string, akhirHari: boolean) {
  if (nilai.includes("T")) return new Date(nilai);
  return new Date(`${nilai}T${akhirHari ? "23:59:59.999" : "00:00:00.000"}Z`);
}

// Rentang relatif dihitung di server, bukan dititipkan lewat URL sebagai
// timestamp mutlak. Dengan begitu tautan unduhannya tetap sama di setiap
// render (tidak memanggil Date.now() saat render) dan tetap bermakna
// "30 hari terakhir" kapan pun dibuka atau dibagikan.
const RENTANG_RELATIF: Record<string, number> = {
  "24j": 24 * 60 * 60 * 1000,
  "7h": 7 * 24 * 60 * 60 * 1000,
  "30h": 30 * 24 * 60 * 60 * 1000,
  "90h": 90 * 24 * 60 * 60 * 1000,
};

function galat(pesan: string, status: number) {
  return Response.json({ error: pesan }, { status });
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  // Proxy sudah mencegat pengunjung anonim, tapi rute ini diperiksa sendiri
  // juga supaya tidak bergantung pada satu lapisan saja.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return galat("Perlu masuk terlebih dahulu.", 401);

  const q = request.nextUrl.searchParams;
  const deviceId = q.get("device");
  const rentangRaw = q.get("rentang");
  const dariRaw = q.get("dari");
  const sampaiRaw = q.get("sampai");

  let dari: Date;
  let sampai: Date;

  if (rentangRaw) {
    const durasi = RENTANG_RELATIF[rentangRaw];
    if (!durasi) {
      return galat(
        `Rentang "${rentangRaw}" tidak dikenal. Pilihan: ${Object.keys(RENTANG_RELATIF).join(", ")}.`,
        400
      );
    }
    sampai = new Date();
    dari = new Date(sampai.getTime() - durasi);
  } else {
    if (!dariRaw || !sampaiRaw) {
      return galat(
        "Isi 'rentang' (24j / 7h / 30h / 90h) atau pasangan 'dari' dan 'sampai' (YYYY-MM-DD).",
        400
      );
    }
    dari = batasWaktu(dariRaw, false);
    sampai = batasWaktu(sampaiRaw, true);
    if (Number.isNaN(dari.getTime()) || Number.isNaN(sampai.getTime())) {
      return galat("Format tanggal tidak dikenali. Gunakan YYYY-MM-DD.", 400);
    }
    if (dari > sampai) {
      return galat("Tanggal 'dari' melewati tanggal 'sampai'.", 400);
    }
  }

  // Nama alat dan ambang batasnya ikut diekspor supaya file bisa dibaca
  // sendirian, tanpa harus membuka aplikasi untuk tahu batasnya berapa.
  const { data: devices, error: errDevices } = await supabase
    .from("devices")
    .select("device_id, nama, batas_suhu, batas_kelembapan");

  if (errDevices) return galat("Gagal memuat daftar alat.", 502);

  const petaAlat = new Map(
    (devices ?? []).map((d) => [d.device_id, d])
  );

  if (deviceId && !petaAlat.has(deviceId)) {
    return galat(`Alat "${deviceId}" tidak ditemukan.`, 404);
  }

  // Hitung dulu supaya bisa menolak sebelum menarik apa pun.
  let hitung = supabase
    .from("readings")
    .select("id", { count: "exact", head: true })
    .gte("created_at", dari.toISOString())
    .lte("created_at", sampai.toISOString());
  if (deviceId) hitung = hitung.eq("device_id", deviceId);

  const { count, error: errCount } = await hitung;
  if (errCount) return galat("Gagal menghitung jumlah pembacaan.", 502);

  if ((count ?? 0) > MAKS_BARIS) {
    return galat(
      `Rentang ini berisi ${(count ?? 0).toLocaleString("id-ID")} pembacaan, melebihi batas ${MAKS_BARIS.toLocaleString("id-ID")}. Persempit rentang tanggalnya.`,
      413
    );
  }

  const baris: string[] = [KOLOM.join(PEMISAH)];

  for (let awal = 0; awal < (count ?? 0); awal += UKURAN_HALAMAN) {
    let kueri = supabase
      .from("readings")
      .select("device_id, suhu, kelembapan, nilai_ldr, risk_index, status, created_at")
      .gte("created_at", dari.toISOString())
      .lte("created_at", sampai.toISOString())
      .order("created_at", { ascending: true })
      .range(awal, awal + UKURAN_HALAMAN - 1);
    if (deviceId) kueri = kueri.eq("device_id", deviceId);

    const { data, error } = await kueri;
    if (error) return galat("Gagal memuat pembacaan.", 502);
    if (!data || data.length === 0) break;

    for (const r of data) {
      const alat = petaAlat.get(r.device_id);
      baris.push(
        barisCsv([
          r.created_at,
          waktuLokal(r.created_at),
          r.device_id,
          alat?.nama ?? "",
          angka(r.suhu, 1),
          angka(r.kelembapan, 1),
          angka(r.nilai_ldr),
          angka(r.risk_index),
          r.status,
          angka(alat?.batas_suhu, 1),
          angka(alat?.batas_kelembapan, 1),
        ])
      );
    }
  }

  const csv = berkasCsv(baris);

  const namaBerkas =
    [
      "jatayuguard",
      deviceId ?? "semua-alat",
      dari.toISOString().slice(0, 10),
      sampai.toISOString().slice(0, 10),
    ].join("_") + ".csv";

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${namaBerkas}"`,
      "Cache-Control": "no-store",
      "X-Jumlah-Baris": String(baris.length - 1),
    },
  });
}
