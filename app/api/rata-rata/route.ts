import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RENTANG_RATA, type KunciRentangRata, type RataAlat } from "@/lib/rata";

// Cadangan kalau fungsi SQL rata_rata_pembacaan belum dipasang: baris
// ditarik dan dirata-ratakan di sini. Sama seperti ekspor dan kejadian,
// Supabase memotong di 1.000 baris per permintaan jadi harus diulang.
const UKURAN_HALAMAN = 1000;
const MAKS_BARIS_CADANGAN = 50_000;

type BarisRpc = {
  device_id: string;
  rata_suhu: number | string | null;
  rata_kelembapan: number | string | null;
  rata_uv: number | string | null;
  jumlah: number | string;
};

function galat(pesan: string, status: number) {
  return Response.json({ error: pesan }, { status });
}

/** numeric Postgres bisa datang sebagai string; nol adalah nilai yang sah. */
function angka(nilai: number | string | null | undefined): number | null {
  if (nilai === null || nilai === undefined) return null;
  const n = typeof nilai === "number" ? nilai : parseFloat(nilai);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return galat("Perlu masuk terlebih dahulu.", 401);

  const rentangRaw = request.nextUrl.searchParams.get("rentang") ?? "24j";
  if (!(rentangRaw in RENTANG_RATA)) {
    return galat(
      `Rentang "${rentangRaw}" tidak dikenal. Pilihan: ${Object.keys(RENTANG_RATA).join(", ")}.`,
      400
    );
  }
  const kunci = rentangRaw as KunciRentangRata;
  const sejak = new Date(Date.now() - RENTANG_RATA[kunci].ms).toISOString();

  const rata: Record<string, RataAlat> = {};

  // Jalur utama: agregasi di Postgres. Satu perjalanan, beberapa baris.
  const { data: rpc, error: errRpc } = await supabase.rpc("rata_rata_pembacaan", { sejak });

  if (!errRpc) {
    for (const b of (rpc ?? []) as BarisRpc[]) {
      rata[b.device_id] = {
        suhu: angka(b.rata_suhu),
        kelembapan: angka(b.rata_kelembapan),
        uv: angka(b.rata_uv),
        jumlah: angka(b.jumlah) ?? 0,
      };
    }
    return Response.json(
      { rentang: kunci, sejak, sumber: "rpc", rata },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  // Cadangan: hitung di sini. Lebih mahal, jadi dibatasi — lebih baik
  // mengaku tidak sanggup daripada diam-diam merata-ratakan sebagian data
  // dan menampilkannya sebagai angka penuh.
  const { count, error: errCount } = await supabase
    .from("readings")
    .select("id", { count: "exact", head: true })
    .gte("created_at", sejak);

  if (errCount) return galat("Gagal menghitung jumlah pembacaan.", 502);

  if ((count ?? 0) > MAKS_BARIS_CADANGAN) {
    return galat(
      `Rentang ini berisi ${(count ?? 0).toLocaleString("id-ID")} pembacaan — terlalu banyak untuk dihitung tanpa fungsi SQL rata_rata_pembacaan. Jalankan 05_rata_rata_pembacaan.sql di Supabase.`,
      413
    );
  }

  // Jumlah dan pembagi dipisah per besaran: satu pembacaan bisa punya suhu
  // tapi tidak punya UV, dan membagi keduanya dengan pembagi yang sama akan
  // menyeret rata-rata UV ke bawah seolah nilainya nol.
  const kumpul: Record<
    string,
    { suhu: number; nSuhu: number; hum: number; nHum: number; uv: number; nUv: number; jumlah: number }
  > = {};

  for (let awal = 0; awal < (count ?? 0); awal += UKURAN_HALAMAN) {
    const { data, error } = await supabase
      .from("readings")
      .select("device_id, suhu, kelembapan, nilai_uv")
      .gte("created_at", sejak)
      .order("created_at", { ascending: true })
      .range(awal, awal + UKURAN_HALAMAN - 1);

    if (error) return galat("Gagal memuat pembacaan.", 502);
    if (!data || data.length === 0) break;

    for (const r of data) {
      const k = (kumpul[r.device_id] ??= {
        suhu: 0,
        nSuhu: 0,
        hum: 0,
        nHum: 0,
        uv: 0,
        nUv: 0,
        jumlah: 0,
      });
      k.jumlah += 1;
      if (r.suhu != null) {
        k.suhu += r.suhu;
        k.nSuhu += 1;
      }
      if (r.kelembapan != null) {
        k.hum += r.kelembapan;
        k.nHum += 1;
      }
      if (r.nilai_uv != null) {
        k.uv += r.nilai_uv;
        k.nUv += 1;
      }
    }
  }

  for (const [deviceId, k] of Object.entries(kumpul)) {
    rata[deviceId] = {
      suhu: k.nSuhu > 0 ? k.suhu / k.nSuhu : null,
      kelembapan: k.nHum > 0 ? k.hum / k.nHum : null,
      uv: k.nUv > 0 ? k.uv / k.nUv : null,
      jumlah: k.jumlah,
    };
  }

  return Response.json(
    { rentang: kunci, sejak, sumber: "cadangan", rata },
    { headers: { "Cache-Control": "no-store" } }
  );
}
