"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import AppHeader from "@/components/AppHeader";
import GrafikTren, { type TitikTren } from "@/components/GrafikTren";
import UnduhCsv from "@/components/UnduhCsv";
import { AreaRangka, RangkaHalamanAlat } from "@/components/Rangka";
import { formatAngka, waktuLengkap } from "@/lib/format";
import { formatDurasi, type Kejadian } from "@/lib/kejadian";
import type { RataAlat } from "@/lib/rata";
import { SEGEL_KONDISI, LABEL_KONDISI } from "@/lib/status";

// Tipe di halaman ini punya kolom tambahan (id) yang tidak dipakai
// dashboard, jadi tetap terpisah dari lib/types.ts.
//
// suhu/kelembapan nullable karena firmware mengirim null saat SHT3x tidak
// terdeteksi saat boot. Selama sensornya hidup, firmware justru menahan
// nilai terakhir saat satu pembacaan gagal, supaya glitch I2C tidak
// memicu alarm palsu — jadi null berarti sensornya memang bermasalah,
// bukan sekadar satu bacaan meleset.
type Device = {
  id: string;
  device_id: string;
  nama: string;
  batas_suhu: number | null;
  batas_kelembapan: number | null;
  batas_uv: number | null;
  last_seen: string | null;
};

type Reading = {
  id: number;
  suhu: number | null;
  kelembapan: number | null;
  nilai_uv: number | null;
  risk_index: number | null;
  status: string;
  created_at: string;
};

const SEGEL_CLASS: Record<string, string> = {
  AMAN: "segel-aman",
  WASPADA: "segel-waspada",
  BAHAYA: "segel-bahaya",
};

const RENTANG = {
  "24j": { label: "24 jam", ms: 24 * 60 * 60 * 1000 },
  "7h": { label: "7 hari", ms: 7 * 24 * 60 * 60 * 1000 },
  "30h": { label: "30 hari", ms: 30 * 24 * 60 * 60 * 1000 },
} as const;

type KunciRentang = keyof typeof RENTANG;

// Batas tarik per permintaan. Tabel readings tumbuh terus, jadi rentang
// panjang tetap harus dibatasi; kalau kena batas kita beri tahu user
// alih-alih diam-diam menampilkan potongan sebagian.
const BATAS_TARIK = 1500;
const MAKS_TITIK_GRAFIK = 400;
const MAKS_BARIS_TABEL = 100;

const KOLOM = [
  { kunci: "created_at", label: "Waktu" },
  { kunci: "suhu", label: "Suhu" },
  { kunci: "kelembapan", label: "Kelembapan" },
  { kunci: "nilai_uv", label: "UV" },
  { kunci: "risk_index", label: "Risiko" },
  { kunci: "status", label: "Status" },
] as const;

type KunciKolom = (typeof KOLOM)[number]["kunci"];

/** Rata-ratakan per kelompok kecil supaya jumlah titik tidak melebihi lebar piksel grafik. */
function ringkasTitik(titik: TitikTren[], maks = MAKS_TITIK_GRAFIK): TitikTren[] {
  if (titik.length <= maks) return titik;
  const ukuran = Math.ceil(titik.length / maks);
  const hasil: TitikTren[] = [];
  for (let i = 0; i < titik.length; i += ukuran) {
    const potong = titik.slice(i, i + ukuran);
    hasil.push({
      waktu: potong[potong.length - 1].waktu,
      nilai: potong.reduce((s, t) => s + t.nilai, 0) / potong.length,
    });
  }
  return hasil;
}

export default function DeviceDetailPage() {
  const params = useParams<{ deviceId: string }>();
  const supabase = createClient();

  const [device, setDevice] = useState<Device | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);
  const [memuatRentang, setMemuatRentang] = useState(false);
  const [rentang, setRentang] = useState<KunciRentang>("24j");
  const [terpotong, setTerpotong] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tersimpan, setTersimpan] = useState(false);
  const [errorMuat, setErrorMuat] = useState<string | null>(null);
  const [errorSimpan, setErrorSimpan] = useState<string | null>(null);
  const [urutan, setUrutan] = useState<{ kunci: KunciKolom; naik: boolean }>({
    kunci: "created_at",
    naik: false,
  });
  const [rata, setRata] = useState<RataAlat | null>(null);
  const [kejadian, setKejadian] = useState<Kejadian[]>([]);
  const [memuatKejadian, setMemuatKejadian] = useState(false);
  const [errorKejadian, setErrorKejadian] = useState<string | null>(null);

  const [namaInput, setNamaInput] = useState("");
  const [batasSuhuInput, setBatasSuhuInput] = useState("");
  const [batasHumInput, setBatasHumInput] = useState("");
  const [batasUvInput, setBatasUvInput] = useState("");

  const muatDevice = useCallback(async () => {
    const { data, error } = await supabase
      .from("devices")
      .select("id, device_id, nama, batas_suhu, batas_kelembapan, batas_uv, last_seen")
      .eq("device_id", params.deviceId)
      .maybeSingle();

    // Query gagal (koneksi/RLS) berbeda maknanya dengan alat yang memang
    // tidak ada. Kalau disamakan, gangguan jaringan akan tampil sebagai
    // "Alat tidak ditemukan" dan user mengira alatnya terhapus.
    if (error) {
      setErrorMuat("Gagal memuat data alat. Periksa koneksi internetmu.");
      return false;
    }

    if (data) {
      setDevice(data);
      setNamaInput(data.nama || "");
      // Alat yang baru mendaftar belum punya ambang batas. Tanpa penjaga
      // ini String(null) mengisi kolom dengan teks "null".
      setBatasSuhuInput(data.batas_suhu?.toString() ?? "");
      setBatasHumInput(data.batas_kelembapan?.toString() ?? "");
      setBatasUvInput(data.batas_uv?.toString() ?? "");
    }
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.deviceId]);

  const muatReadings = useCallback(
    async (kunci: KunciRentang) => {
      const batasWaktu = new Date(Date.now() - RENTANG[kunci].ms).toISOString();

      const { data, error } = await supabase
        .from("readings")
        .select("id, suhu, kelembapan, nilai_uv, risk_index, status, created_at")
        .eq("device_id", params.deviceId)
        .gte("created_at", batasWaktu)
        .order("created_at", { ascending: false })
        .limit(BATAS_TARIK);

      if (error) {
        setErrorMuat("Gagal memuat riwayat pembacaan. Periksa koneksi internetmu.");
        return false;
      }

      setReadings(data ?? []);
      setTerpotong((data?.length ?? 0) >= BATAS_TARIK);
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params.deviceId]
  );

  // Rata-rata juga diturunkan di server dari SELURUH pembacaan dalam
  // rentang, bukan dari 1.500 baris yang dimuat halaman ini — dan bukan
  // pula dari titik grafik, yang sudah diringkas per kelompok.
  //
  // Kegagalannya sengaja tidak memunculkan pesan error: grafiknya tetap
  // utuh dan terbaca tanpa garis rata-rata, jadi memasang peringatan merah
  // di sini hanya akan menakuti tanpa ada yang perlu ditindak.
  const muatRata = useCallback(
    async (kunci: KunciRentang) => {
      try {
        const res = await fetch(`/api/rata-rata?rentang=${kunci}`);
        if (!res.ok) return setRata(null);
        const badan = await res.json();
        setRata(badan.rata?.[params.deviceId] ?? null);
      } catch {
        setRata(null);
      }
    },
    [params.deviceId]
  );

  // Kejadian diturunkan di server dari SELURUH pembacaan dalam rentang,
  // bukan dari 1.500 baris yang dimuat halaman ini. Kejadian yang dihitung
  // dari data terpotong bukan cuma kurang lengkap — durasinya salah dan
  // batas potongan akan tampil sebagai keheningan palsu.
  const muatKejadian = useCallback(
    async (kunci: KunciRentang) => {
      setMemuatKejadian(true);
      setErrorKejadian(null);
      try {
        const res = await fetch(
          `/api/kejadian?device=${encodeURIComponent(params.deviceId)}&rentang=${kunci}`
        );
        if (!res.ok) {
          const badan = await res.json().catch(() => null);
          setErrorKejadian(badan?.error ?? "Gagal memuat riwayat kejadian.");
          setKejadian([]);
        } else {
          const badan = await res.json();
          setKejadian(badan.kejadian ?? []);
        }
      } catch {
        setErrorKejadian("Gagal memuat riwayat kejadian. Periksa koneksi internetmu.");
        setKejadian([]);
      }
      setMemuatKejadian(false);
    },
    [params.deviceId]
  );

  useEffect(() => {
    (async () => {
      const ok = await muatDevice();
      if (ok) {
        await muatReadings(rentang);
        muatKejadian(rentang);
        muatRata(rentang);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.deviceId]);

  async function gantiRentang(kunci: KunciRentang) {
    if (kunci === rentang) return;
    setRentang(kunci);
    setMemuatRentang(true);
    muatKejadian(kunci);
    muatRata(kunci);
    await muatReadings(kunci);
    setMemuatRentang(false);
  }

  // Tanpa validasi, mengosongkan kolom membuat parseFloat menghasilkan NaN
  // yang lalu ditulis ke database sebagai ambang batas alat.
  function periksaMasukan() {
    if (!namaInput.trim()) return "Nama tampilan tidak boleh kosong.";

    const suhu = parseFloat(batasSuhuInput);
    if (!Number.isFinite(suhu)) return "Batas suhu harus berupa angka.";
    if (suhu < -40 || suhu > 125) return "Batas suhu di luar jangkauan sensor (-40 sampai 125 °C).";

    const hum = parseFloat(batasHumInput);
    if (!Number.isFinite(hum)) return "Batas kelembapan harus berupa angka.";
    if (hum < 0 || hum > 100) return "Batas kelembapan harus antara 0 dan 100 %.";

    // Skala UV Index WHO/WMO adalah 0-11; di luar itu bukan angka yang
    // bisa dihasilkan sensor GUVA-S12SD.
    const uv = parseFloat(batasUvInput);
    if (!Number.isFinite(uv)) return "Batas UV harus berupa angka.";
    if (uv < 0 || uv > 11) return "Batas UV harus antara 0 dan 11 (skala UV Index).";

    return null;
  }

  async function handleSimpan(e: React.FormEvent) {
    e.preventDefault();
    if (!device) return;

    const keluhan = periksaMasukan();
    if (keluhan) {
      setErrorSimpan(keluhan);
      setTersimpan(false);
      return;
    }

    setSaving(true);
    setTersimpan(false);
    setErrorSimpan(null);

    const { error } = await supabase
      .from("devices")
      .update({
        nama: namaInput,
        batas_suhu: parseFloat(batasSuhuInput),
        batas_kelembapan: parseFloat(batasHumInput),
        batas_uv: parseFloat(batasUvInput),
      })
      .eq("device_id", device.device_id);

    setSaving(false);

    // Sebelumnya cabang error diabaikan diam-diam: tombol kembali normal
    // dan user mengira perubahannya tersimpan padahal tidak.
    if (error) {
      setErrorSimpan("Gagal menyimpan perubahan. Coba lagi.");
      return;
    }

    setTersimpan(true);
    muatDevice();
  }

  // Konfirmasi "Tersimpan." dulu menetap selamanya, sehingga user tidak bisa
  // membedakan konfirmasi penyimpanan barusan dengan yang tadi.
  useEffect(() => {
    if (!tersimpan) return;
    const t = setTimeout(() => setTersimpan(false), 4000);
    return () => clearTimeout(t);
  }, [tersimpan]);

  if (loading) {
    return (
      <AreaRangka label="Memuat catatan alat…">
        <RangkaHalamanAlat />
      </AreaRangka>
    );
  }

  if (errorMuat) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
        <p className="text-[var(--bata)]" role="alert">
          {errorMuat}
        </p>
        <button
          onClick={() => {
            setLoading(true);
            setErrorMuat(null);
            (async () => {
              const ok = await muatDevice();
              if (ok) await muatReadings(rentang);
              setLoading(false);
            })();
          }}
          className="border border-[var(--line)] inline-flex h-11 items-center px-5 text-sm text-[var(--tinta)] transition hover:border-[var(--soga)] hover:text-[var(--soga)]"
        >
          Coba lagi
        </button>
        <Link href="/dashboard" className="text-sm text-[var(--soga)] underline">
          Kembali ke ruang pemantauan
        </Link>
      </div>
    );
  }

  if (!device) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 text-[var(--tinta-soft)]">
        <p>Alat tidak ditemukan.</p>
        <Link href="/dashboard" className="text-[var(--soga)] underline">
          Kembali ke ruang pemantauan
        </Link>
      </div>
    );
  }

  function gantiUrutan(kunci: KunciKolom) {
    setUrutan((p) =>
      p.kunci === kunci ? { kunci, naik: !p.naik } : { kunci, naik: kunci === "created_at" ? false : true }
    );
  }

  // Pengurutan hanya menata ulang tampilan tabel; grafik tetap memakai
  // urutan waktu karena sumbu-X-nya memang waktu.
  const barisTampil = [...readings]
    .sort((a, b) => {
      const av = a[urutan.kunci];
      const bv = b[urutan.kunci];
      let beda: number;
      if (urutan.kunci === "created_at") beda = new Date(av as string).getTime() - new Date(bv as string).getTime();
      else if (typeof av === "number" && typeof bv === "number") beda = av - bv;
      else beda = String(av).localeCompare(String(bv), "id");
      return urutan.naik ? beda : -beda;
    })
    .slice(0, MAKS_BARIS_TABEL);

  // Grafik butuh urutan menaik (kiri = lama, kanan = baru).
  const menaik = [...readings].reverse();
  // Pembacaan tanpa nilai DIBUANG dari grafik, bukan dijadikan nol.
  // Nol adalah suhu yang sah; menggambarnya sebagai nol akan mengarang
  // penurunan drastis yang tidak pernah terjadi. Dan null yang lolos ke
  // perhitungan koordinat menghasilkan NaN, yang merusak seluruh path SVG.
  const titikDari = (ambil: (r: Reading) => number | null) =>
    ringkasTitik(
      menaik
        .filter((r) => ambil(r) != null)
        .map((r) => ({ waktu: new Date(r.created_at).getTime(), nilai: ambil(r) as number }))
    );

  const titikSuhu = titikDari((r) => r.suhu);
  const titikHum = titikDari((r) => r.kelembapan);
  const titikUv = titikDari((r) => r.nilai_uv);
  const pembacaanGagal = menaik.filter((r) => r.suhu == null || r.kelembapan == null).length;
  const diringkas = titikSuhu.length < menaik.length;

  // Granularitas label sumbu mengikuti rentang data yang BENAR-BENAR ada,
  // bukan rentang yang dipilih. Kalau alat cuma sempat mengirim satu hari
  // dalam jendela 30 hari, label harian akan mencetak "15 Jul" tiga kali
  // dan tidak memberi tahu apa pun.
  const bentangMs =
    titikSuhu.length > 1 ? titikSuhu[titikSuhu.length - 1].waktu - titikSuhu[0].waktu : 0;
  const formatSumbu =
    bentangMs < 36 * 60 * 60 * 1000
      ? (t: number) => new Date(t).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
      : bentangMs < 7 * 24 * 60 * 60 * 1000
      ? (t: number) =>
          new Date(t).toLocaleString("id-ID", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })
      : (t: number) => new Date(t).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });

  return (
    <div className="min-h-dvh px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-3xl">
        <AppHeader
          eyebrow={`Catatan Alat · ${device.device_id}`}
          judul={device.nama || device.device_id}
          kembali={{ href: "/dashboard", label: "Ruang pemantauan" }}
        />

        <main id="konten">
        {/* Form konfigurasi */}
        <form onSubmit={handleSimpan} className="kartu-kain mb-8 px-7 py-7">
          <h2 className="label-arsip mb-5">Konfigurasi</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="nama-tampilan" className="label-arsip mb-2 block !text-[10px]">
                Nama tampilan
              </label>
              <input
                id="nama-tampilan"
                value={namaInput}
                onChange={(e) => setNamaInput(e.target.value)}
                className="w-full border border-[var(--line)] bg-[var(--input-bg)] h-11 px-3 text-sm outline-none focus:border-[var(--soga)]"
              />
            </div>
            <div>
              <label htmlFor="batas-suhu" className="label-arsip mb-2 block !text-[10px]">
                Batas suhu (°C)
              </label>
              <input
                id="batas-suhu"
                type="number"
                step="0.1"
                value={batasSuhuInput}
                onChange={(e) => setBatasSuhuInput(e.target.value)}
                className="w-full border border-[var(--line)] bg-[var(--input-bg)] h-11 px-3 text-sm outline-none focus:border-[var(--soga)]"
              />
            </div>
            <div>
              <label htmlFor="batas-kelembapan" className="label-arsip mb-2 block !text-[10px]">
                Batas kelembapan (%)
              </label>
              <input
                id="batas-kelembapan"
                type="number"
                step="0.1"
                value={batasHumInput}
                onChange={(e) => setBatasHumInput(e.target.value)}
                className="w-full border border-[var(--line)] bg-[var(--input-bg)] h-11 px-3 text-sm outline-none focus:border-[var(--soga)]"
              />
            </div>
            <div>
              <label htmlFor="batas-uv" className="label-arsip mb-2 block !text-[10px]">
                Batas UV Index
              </label>
              <input
                id="batas-uv"
                type="number"
                step="0.1"
                min="0"
                max="11"
                value={batasUvInput}
                onChange={(e) => setBatasUvInput(e.target.value)}
                aria-describedby="petunjuk-uv"
                className="w-full border border-[var(--line)] bg-[var(--input-bg)] h-11 px-3 text-sm outline-none focus:border-[var(--soga)]"
              />
            </div>
          </div>
          {/* Angka ini tidak jelas sendirian: skala UV Index 0-11 asing bagi
              kebanyakan orang, dan yang penting justru rentang bawahnya. */}
          <p id="petunjuk-uv" className="mt-3 text-xs text-[var(--tinta-soft)]">
            Ruang penyimpanan tertutup yang sehat membaca mendekati 0. Bacaan yang
            bertahan di atas 1,0 menandakan ada sumber UV nyata — celah sinar
            matahari, atau lampu neon tanpa filter.
          </p>
          <p className="mt-4 text-xs text-[var(--tinta-soft)]">
            Perubahan diterapkan saat alat menyala ulang atau menyambung WiFi kembali.
          </p>

          {errorSimpan && (
            <p
              role="alert"
              className="mt-4 border-l-2 border-[var(--bata)] bg-[var(--bata-bg)] px-3 py-2 text-sm text-[var(--bata)]"
            >
              {errorSimpan}
            </p>
          )}

          <div className="mt-5 flex items-center gap-4">
            <button
              type="submit"
              disabled={saving}
              className="bg-[var(--soga)] inline-flex h-11 items-center px-5 text-sm font-medium text-[var(--kain)] transition hover:bg-[var(--soga-deep)] disabled:opacity-50"
            >
              {saving ? "Menyimpan…" : "Simpan perubahan"}
            </button>
            {tersimpan && <span className="text-sm text-[var(--indigo)]">Tersimpan.</span>}
          </div>
        </form>

        {/* Satu baris filter yang men-scope SEMUA di bawahnya: kedua grafik
            dan tabel riwayat, supaya angkanya selalu sepakat. */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="label-arsip mr-1 !text-[10px]">Rentang</span>
          {(Object.keys(RENTANG) as KunciRentang[]).map((k) => (
            <button
              key={k}
              onClick={() => gantiRentang(k)}
              aria-pressed={rentang === k}
              className={`inline-flex h-11 items-center border px-4 text-sm transition ${
                rentang === k
                  ? "border-[var(--soga)] text-[var(--soga)]"
                  : "border-[var(--line)] text-[var(--tinta-soft)] hover:border-[var(--soga)] hover:text-[var(--soga)]"
              }`}
            >
              {RENTANG[k].label}
            </button>
          ))}

          {/* Unduhan menarik ulang datanya sendiri di server, jadi tidak
              terbatas pada 1.500 baris yang sedang dimuat di halaman ini —
              dan rentangnya boleh berbeda dari rentang tampilan, termasuk
              tanggal pilihan sendiri.

              ml-auto hanya dari sm ke atas: di layar sempit baris ini
              membungkus, dan ml-auto akan mendorong tombol sendirian ke
              tepi kanan sehingga terlihat terdampar dari kelompoknya. */}
          <UnduhCsv deviceId={device.device_id} preset={rentang} className="sm:ml-auto" />
        </div>

        {/* Dua grafik terpisah, BUKAN satu grafik dua sumbu-Y: suhu (°C) dan
            kelembapan (%) skalanya beda, menumpuknya akan mengarang korelasi
            yang tidak ada di data. */}
        <div className="kartu-kain mb-8 px-7 py-7">
          <h2 className="label-arsip mb-6">Tren pembacaan</h2>
          <div className="space-y-8">
            <GrafikTren
              judul="Suhu"
              satuan="°C"
              data={titikSuhu}
              batas={device.batas_suhu ?? null}
              rata={rata?.suhu ?? null}
              warna="var(--soga)"
              formatWaktu={formatSumbu}
              formatWaktuPanjang={(t) => waktuLengkap(new Date(t).toISOString())}
              memuat={memuatRentang}
            />
            <GrafikTren
              judul="Kelembapan"
              satuan="%"
              data={titikHum}
              minimum={0}
              batas={device.batas_kelembapan ?? null}
              rata={rata?.kelembapan ?? null}
              warna="var(--indigo)"
              formatWaktu={formatSumbu}
              formatWaktuPanjang={(t) => waktuLengkap(new Date(t).toISOString())}
              memuat={memuatRentang}
            />
            {/* UV pakai kunyit: warna ketiga yang sudah tervalidasi kontrasnya
                di kedua tema, dan secara makna cocok untuk cahaya. */}
            <GrafikTren
              judul="UV Index"
              satuan=""
              data={titikUv}
              desimal={2}
              minimum={0}
              batas={device.batas_uv ?? null}
              rata={rata?.uv ?? null}
              warna="var(--kunyit)"
              formatWaktu={formatSumbu}
              formatWaktuPanjang={(t) => waktuLengkap(new Date(t).toISOString())}
              memuat={memuatRentang}
            />
          </div>

          {(terpotong || diringkas || pembacaanGagal > 0) && (
            <p className="mt-6 text-xs text-[var(--tinta-soft)]">
              {terpotong && `Menampilkan ${BATAS_TARIK.toLocaleString("id-ID")} pembacaan terbaru dalam rentang ini. `}
              {diringkas && `Titik dirata-ratakan per kelompok agar grafik tetap terbaca. `}
              {/* Dibuang diam-diam akan membuat grafik terlihat mulus padahal
                  sebagian datanya tidak ada — justru hal yang perlu diketahui.
                  Kata-katanya netral karena penyebabnya bisa sensor gagal
                  baca ATAU alat yang memang tidak mengukur besaran itu. */}
              {pembacaanGagal > 0 &&
                `${pembacaanGagal} pembacaan tidak menyertakan suhu/kelembapan dan tidak digambar.`}
            </p>
          )}
        </div>

        {/* Riwayat kejadian — pertanyaan "berapa kali dan berapa lama" tidak
            bisa dijawab oleh tabel pembacaan mentah. */}
        <div className="kartu-kain mb-8 px-7 py-7">
          <h2 className="label-arsip mb-5">Riwayat kejadian</h2>

          {memuatKejadian ? (
            <p className="text-sm text-[var(--tinta-soft)]">Menghitung kejadian…</p>
          ) : errorKejadian ? (
            <p role="alert" className="text-sm text-[var(--bata)]">
              {errorKejadian}
            </p>
          ) : kejadian.length === 0 ? (
            <p className="text-sm text-[var(--tinta-soft)]">
              Tidak ada kejadian pada rentang ini — alat mengirim terus dan selalu
              di dalam batas.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--line-halus)]">
              {kejadian.map((k, i) => (
                <li key={`${k.jenis}-${k.mulai}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
                  <span className={`segel-status ${SEGEL_KONDISI[k.jenis]} self-center`} />
                  <span className="text-sm font-medium text-[var(--tinta)]">
                    {LABEL_KONDISI[k.jenis]}
                  </span>
                  <span
                    className="text-sm text-[var(--tinta-soft)]"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {waktuLengkap(k.mulai)}
                    {k.selesai ? ` → ${waktuLengkap(k.selesai)}` : " → masih berlangsung"}
                  </span>
                  <span className="text-sm text-[var(--tinta)] sm:ml-auto">
                    {formatDurasi(k.durasiMs)}
                  </span>
                  {k.jumlahPembacaan > 0 && (
                    <span className="w-full pl-6 text-xs text-[var(--tinta-soft)]">
                      {/* Hanya besaran yang benar-benar terukur yang disebut.
                          Menulis "puncak —°C" untuk alat yang sensor suhunya
                          mati hanya menambah derau. */}
                      {[
                        k.puncakSuhu != null ? `${formatAngka(k.puncakSuhu)}°C` : null,
                        k.puncakKelembapan != null ? `${formatAngka(k.puncakKelembapan)}%` : null,
                        k.puncakUv != null ? `UV ${formatAngka(k.puncakUv, 2)}` : null,
                      ].filter(Boolean).length > 0 && (
                        <>
                          puncak{" "}
                          {[
                            k.puncakSuhu != null ? `${formatAngka(k.puncakSuhu)}°C` : null,
                            k.puncakKelembapan != null ? `${formatAngka(k.puncakKelembapan)}%` : null,
                            k.puncakUv != null ? `UV ${formatAngka(k.puncakUv, 2)}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}{" "}
                          ·{" "}
                        </>
                      )}
                      {k.jumlahPembacaan} pembacaan
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Riwayat — padanan tabel dari grafik di atas, dari potongan data yang sama */}
        <div className="kartu-kain px-7 py-7">
          <h2 className="label-arsip mb-5">Riwayat pembacaan</h2>
          {readings.length === 0 ? (
            <p className="text-sm text-[var(--tinta-soft)]">Belum ada data pada rentang ini.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
                <caption className="sr-only">
                  Riwayat pembacaan {device.nama || device.device_id} selama {RENTANG[rentang].label} terakhir
                </caption>
                <thead>
                  <tr className="border-b border-[var(--line)] text-left">
                    {KOLOM.map((kol) => (
                      <th
                        key={kol.kunci}
                        scope="col"
                        // aria-sort memberi tahu screen reader kolom mana yang
                        // sedang menjadi dasar urutan dan ke arah mana.
                        aria-sort={
                          urutan.kunci === kol.kunci
                            ? urutan.naik
                              ? "ascending"
                              : "descending"
                            : "none"
                        }
                        className="py-0 pr-4 last:pr-0"
                      >
                        <button
                          type="button"
                          onClick={() => gantiUrutan(kol.kunci)}
                          className="label-arsip inline-flex h-11 items-center gap-1.5 !text-[10px] transition hover:text-[var(--soga)]"
                        >
                          {kol.label}
                          <span aria-hidden="true" className="text-[9px]">
                            {urutan.kunci === kol.kunci ? (urutan.naik ? "▲" : "▼") : "↕"}
                          </span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {barisTampil.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--line)]/60">
                      <td className="py-2.5 pr-4 text-[var(--tinta-soft)]">{waktuLengkap(r.created_at)}</td>
                      <td className="py-2.5 pr-4 text-[var(--tinta)]">{formatAngka(r.suhu)}°C</td>
                      <td className="py-2.5 pr-4 text-[var(--tinta)]">{formatAngka(r.kelembapan)}%</td>
                      <td className="py-2.5 pr-4 text-[var(--tinta)]">{formatAngka(r.nilai_uv, 2)}</td>
                      <td className="py-2.5 pr-4 text-[var(--tinta)]">{formatAngka(r.risk_index, 0)}</td>
                      <td className="py-2.5">
                        <span className="inline-flex items-center gap-2">
                          <span className={`segel-status ${SEGEL_CLASS[r.status]}`} />
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {readings.length > MAKS_BARIS_TABEL && (
                <p className="mt-4 text-xs text-[var(--tinta-soft)]">
                  Menampilkan {MAKS_BARIS_TABEL} pembacaan terbaru dari {readings.length.toLocaleString("id-ID")} dalam
                  rentang ini.
                </p>
              )}
            </div>
          )}
        </div>
        </main>
      </div>
    </div>
  );
}
