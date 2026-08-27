import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RENTANG_RATA, type KunciRentangRata } from "@/lib/rata";
import { JUMLAH_EMBER, type TitikTren } from "@/lib/tren";

// Cadangan kalau fungsi SQL tren_pembacaan belum dipasang: baris ditarik
// dan diember di sini. Supabase memotong di 1.000 baris per permintaan,
// jadi harus diulang.
const UKURAN_HALAMAN = 1000;
const MAKS_BARIS_CADANGAN = 100_000;

type BarisRpc = {
  no_ember: number | string;
  waktu: string;
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

  const q = request.nextUrl.searchParams;
  const deviceId = q.get("device");
  const rentangRaw = q.get("rentang") ?? "24j";

  if (!deviceId) return galat("Parameter 'device' wajib diisi.", 400);
  if (!(rentangRaw in RENTANG_RATA)) {
    return galat(
      `Rentang "${rentangRaw}" tidak dikenal. Pilihan: ${Object.keys(RENTANG_RATA).join(", ")}.`,
      400
    );
  }

  const kunci = rentangRaw as KunciRentangRata;
  const sampai = new Date();
  const sejak = new Date(sampai.getTime() - RENTANG_RATA[kunci].ms);

  // Jalur utama: pengemberan di Postgres. Berapa pun banyaknya baris dalam
  // rentang, yang kembali ke sini paling banyak JUMLAH_EMBER titik.
  const { data: rpc, error: errRpc } = await supabase.rpc("tren_pembacaan", {
    p_device: deviceId,
    p_sejak: sejak.toISOString(),
    p_sampai: sampai.toISOString(),
    p_jumlah_ember: JUMLAH_EMBER,
  });

  if (!errRpc) {
    const titik: TitikTren[] = ((rpc ?? []) as BarisRpc[]).map((b) => ({
      waktu: new Date(b.waktu).getTime(),
      suhu: angka(b.rata_suhu),
      kelembapan: angka(b.rata_kelembapan),
      uv: angka(b.rata_uv),
      jumlah: angka(b.jumlah) ?? 0,
    }));

    return Response.json(
      {
        rentang: kunci,
        sejak: sejak.toISOString(),
        sampai: sampai.toISOString(),
        sumber: "rpc",
        jumlahPembacaan: titik.reduce((s, t) => s + t.jumlah, 0),
        titik,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  // Cadangan: tarik barisnya lalu ember di sini. Lebih mahal, jadi dibatasi
  // — lebih baik mengaku tidak sanggup daripada diam-diam menggambar
  // sebagian rentang dan membiarkannya tampak sebagai rentang penuh.
  const { count, error: errCount } = await supabase
    .from("readings")
    .select("id", { count: "exact", head: true })
    .eq("device_id", deviceId)
    .gte("created_at", sejak.toISOString())
    .lte("created_at", sampai.toISOString());

  if (errCount) return galat("Gagal menghitung jumlah pembacaan.", 502);

  if ((count ?? 0) > MAKS_BARIS_CADANGAN) {
    return galat(
      `Rentang ini berisi ${(count ?? 0).toLocaleString("id-ID")} pembacaan — terlalu banyak untuk diringkas tanpa fungsi SQL tren_pembacaan. Jalankan 08_tren_pembacaan.sql di Supabase.`,
      413
    );
  }

  // Jumlah dan pembagi dipisah per besaran: satu pembacaan bisa punya suhu
  // tapi tidak punya UV, dan membagi keduanya dengan pembagi yang sama akan
  // menyeret rata-rata UV ke bawah seolah nilainya nol.
  type Ember = {
    waktu: number;
    suhu: number;
    nSuhu: number;
    hum: number;
    nHum: number;
    uv: number;
    nUv: number;
    jumlah: number;
  };
  const ember = new Map<number, Ember>();

  const e0 = sejak.getTime();
  const lebar = Math.max(sampai.getTime() - e0, 1000) / JUMLAH_EMBER;

  for (let awal = 0; awal < (count ?? 0); awal += UKURAN_HALAMAN) {
    const { data, error } = await supabase
      .from("readings")
      .select("created_at, suhu, kelembapan, nilai_uv")
      .eq("device_id", deviceId)
      .gte("created_at", sejak.toISOString())
      .lte("created_at", sampai.toISOString())
      .order("created_at", { ascending: true })
      .range(awal, awal + UKURAN_HALAMAN - 1);

    if (error) return galat("Gagal memuat pembacaan.", 502);
    if (!data || data.length === 0) break;

    for (const r of data) {
      const t = new Date(r.created_at).getTime();
      const idx = Math.min(Math.floor((t - e0) / lebar), JUMLAH_EMBER - 1);
      let e = ember.get(idx);
      if (!e) {
        e = { waktu: t, suhu: 0, nSuhu: 0, hum: 0, nHum: 0, uv: 0, nUv: 0, jumlah: 0 };
        ember.set(idx, e);
      }
      // Baris datang menaik, jadi yang terakhir masuk adalah yang terbaru.
      e.waktu = t;
      e.jumlah += 1;
      if (r.suhu != null) {
        e.suhu += r.suhu;
        e.nSuhu += 1;
      }
      if (r.kelembapan != null) {
        e.hum += r.kelembapan;
        e.nHum += 1;
      }
      if (r.nilai_uv != null) {
        e.uv += r.nilai_uv;
        e.nUv += 1;
      }
    }
  }

  const titik: TitikTren[] = [...ember.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, e]) => ({
      waktu: e.waktu,
      suhu: e.nSuhu > 0 ? e.suhu / e.nSuhu : null,
      kelembapan: e.nHum > 0 ? e.hum / e.nHum : null,
      uv: e.nUv > 0 ? e.uv / e.nUv : null,
      jumlah: e.jumlah,
    }));

  return Response.json(
    {
      rentang: kunci,
      sejak: sejak.toISOString(),
      sampai: sampai.toISOString(),
      sumber: "cadangan",
      jumlahPembacaan: count ?? 0,
      titik,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
