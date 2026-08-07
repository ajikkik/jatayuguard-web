import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { turunkanKejadian, type PembacaanRingkas } from "@/lib/kejadian";

// Sama seperti ekspor: Supabase memotong di 1.000 baris per permintaan,
// jadi harus diulang. Kejadian yang diturunkan dari data terpotong akan
// SALAH (periode terpangkas, keheningan palsu di batas potongan), bukan
// sekadar kurang lengkap — jadi paginasi di sini wajib.
const UKURAN_HALAMAN = 1000;
const MAKS_BARIS = 100_000;

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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return galat("Perlu masuk terlebih dahulu.", 401);

  const q = request.nextUrl.searchParams;
  const deviceId = q.get("device");
  const rentangRaw = q.get("rentang") ?? "30h";

  if (!deviceId) return galat("Parameter 'device' wajib diisi.", 400);

  const durasi = RENTANG_RELATIF[rentangRaw];
  if (!durasi) {
    return galat(
      `Rentang "${rentangRaw}" tidak dikenal. Pilihan: ${Object.keys(RENTANG_RELATIF).join(", ")}.`,
      400
    );
  }

  const sampai = new Date();
  const dari = new Date(sampai.getTime() - durasi);

  const { count, error: errCount } = await supabase
    .from("readings")
    .select("id", { count: "exact", head: true })
    .eq("device_id", deviceId)
    .gte("created_at", dari.toISOString())
    .lte("created_at", sampai.toISOString());

  if (errCount) return galat("Gagal menghitung jumlah pembacaan.", 502);

  if ((count ?? 0) > MAKS_BARIS) {
    return galat(
      `Rentang ini berisi ${(count ?? 0).toLocaleString("id-ID")} pembacaan, melebihi batas ${MAKS_BARIS.toLocaleString("id-ID")}. Persempit rentangnya.`,
      413
    );
  }

  const pembacaan: PembacaanRingkas[] = [];

  for (let awal = 0; awal < (count ?? 0); awal += UKURAN_HALAMAN) {
    const { data, error } = await supabase
      .from("readings")
      .select("created_at, status, suhu, kelembapan")
      .eq("device_id", deviceId)
      .gte("created_at", dari.toISOString())
      .lte("created_at", sampai.toISOString())
      .order("created_at", { ascending: true })
      .range(awal, awal + UKURAN_HALAMAN - 1);

    if (error) return galat("Gagal memuat pembacaan.", 502);
    if (!data || data.length === 0) break;
    pembacaan.push(...(data as PembacaanRingkas[]));
  }

  return Response.json(
    {
      device_id: deviceId,
      rentang: rentangRaw,
      dari: dari.toISOString(),
      sampai: sampai.toISOString(),
      jumlahPembacaan: pembacaan.length,
      kejadian: turunkanKejadian(pembacaan, sampai.toISOString()),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
