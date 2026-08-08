// Menurunkan KEJADIAN dari deret pembacaan.
//
// Tabel readings hanya menyimpan cuplikan per waktu, sehingga pertanyaan
// seperti "berapa kali lemari ini lewat batas bulan lalu, dan berapa lama?"
// tidak bisa dijawab tanpa mengolahnya dulu. Modul ini menyatukan pembacaan
// berurutan yang statusnya sama menjadi satu periode, dan memperlakukan
// jeda pengiriman yang panjang sebagai kejadian tersendiri.
//
// Semua fungsi di sini murni supaya bisa diuji tanpa database.

export type JenisKejadian = "BAHAYA" | "WASPADA" | "DIAM";

export type PembacaanRingkas = {
  created_at: string;
  status: string;
  // Sensor yang gagal baca menyimpan null.
  suhu: number | null;
  kelembapan: number | null;
};

/**
 * Math.max(x, null) memperlakukan null sebagai 0, sehingga satu pembacaan
 * gagal akan melaporkan "puncak 0°C" — lebih buruk daripada tidak melapor.
 */
function puncakBaru(lama: number | null, baru: number | null) {
  if (baru === null) return lama;
  if (lama === null) return baru;
  return Math.max(lama, baru);
}

export type Kejadian = {
  jenis: JenisKejadian;
  mulai: string;
  /** null berarti kejadian masih berlangsung di ujung rentang yang diminta. */
  selesai: string | null;
  durasiMs: number;
  puncakSuhu: number | null;
  puncakKelembapan: number | null;
  jumlahPembacaan: number;
};

/** Jeda minimum sebelum sebuah keheningan dianggap kejadian. */
const MIN_JEDA_DIAM_MS = 10 * 60 * 1000;
const KELIPATAN_JEDA = 5;

/**
 * Ambang "diam" diturunkan dari datanya sendiri, bukan dipatok.
 *
 * Firmware bisa mengirim tiap 30 detik atau tiap 5 menit; angka tetap akan
 * memunculkan ratusan kejadian palsu pada yang satu, dan melewatkan
 * keheningan nyata pada yang lain. Median interval ditambah pengali
 * membuatnya menyesuaikan diri.
 */
export function ambangDiam(pembacaan: PembacaanRingkas[]) {
  if (pembacaan.length < 3) return MIN_JEDA_DIAM_MS;

  const jeda: number[] = [];
  for (let i = 1; i < pembacaan.length; i++) {
    jeda.push(
      new Date(pembacaan[i].created_at).getTime() -
        new Date(pembacaan[i - 1].created_at).getTime()
    );
  }
  jeda.sort((a, b) => a - b);
  const median = jeda[Math.floor(jeda.length / 2)];
  return Math.max(MIN_JEDA_DIAM_MS, median * KELIPATAN_JEDA);
}

/**
 * @param pembacaan Harus urut MENAIK menurut created_at.
 * @param hingga Ujung rentang yang diminta (biasanya "sekarang"). Kalau
 *   pembacaan terakhir jauh sebelum ini, keheningan penutup ikut dicatat
 *   sebagai kejadian — dan periode yang sedang berjalan DITUTUP di
 *   pembacaan terakhir, bukan dibiarkan "masih berlangsung". Alat yang
 *   diam sejak tiga minggu lalu tidak sedang melaporkan bahaya; kita
 *   justru tidak tahu apa-apa tentangnya.
 */
export function turunkanKejadian(
  pembacaan: PembacaanRingkas[],
  hingga?: string
): Kejadian[] {
  if (pembacaan.length === 0) return [];

  const ambang = ambangDiam(pembacaan);
  const hasil: Kejadian[] = [];

  let berjalan: {
    jenis: JenisKejadian;
    mulai: string;
    akhir: string;
    puncakSuhu: number | null;
    puncakKelembapan: number | null;
    jumlah: number;
  } | null = null;

  function tutup(selesai: string | null) {
    if (!berjalan) return;
    const akhir = selesai ?? berjalan.akhir;
    hasil.push({
      jenis: berjalan.jenis,
      mulai: berjalan.mulai,
      selesai,
      durasiMs: new Date(akhir).getTime() - new Date(berjalan.mulai).getTime(),
      puncakSuhu: berjalan.puncakSuhu,
      puncakKelembapan: berjalan.puncakKelembapan,
      jumlahPembacaan: berjalan.jumlah,
    });
    berjalan = null;
  }

  for (let i = 0; i < pembacaan.length; i++) {
    const p = pembacaan[i];

    // Keheningan panjang memutus periode apa pun yang sedang berjalan:
    // BAHAYA sebelum dan sesudah alat mati tiga jam adalah dua episode
    // berbeda, bukan satu yang panjang.
    if (i > 0) {
      const sebelum = pembacaan[i - 1];
      const jeda =
        new Date(p.created_at).getTime() - new Date(sebelum.created_at).getTime();
      if (jeda > ambang) {
        tutup(sebelum.created_at);
        hasil.push({
          jenis: "DIAM",
          mulai: sebelum.created_at,
          selesai: p.created_at,
          durasiMs: jeda,
          puncakSuhu: null,
          puncakKelembapan: null,
          jumlahPembacaan: 0,
        });
      }
    }

    const jenis: JenisKejadian | null =
      p.status === "BAHAYA" ? "BAHAYA" : p.status === "WASPADA" ? "WASPADA" : null;

    if (jenis === null) {
      tutup(p.created_at);
      continue;
    }

    if (berjalan && berjalan.jenis === jenis) {
      berjalan.akhir = p.created_at;
      berjalan.puncakSuhu = puncakBaru(berjalan.puncakSuhu, p.suhu);
      berjalan.puncakKelembapan = puncakBaru(berjalan.puncakKelembapan, p.kelembapan);
      berjalan.jumlah += 1;
    } else {
      tutup(p.created_at);
      berjalan = {
        jenis,
        mulai: p.created_at,
        akhir: p.created_at,
        puncakSuhu: p.suhu,
        puncakKelembapan: p.kelembapan,
        jumlah: 1,
      };
    }
  }

  // Keheningan penutup: jarak antara pembacaan terakhir dan ujung rentang.
  const terakhir = pembacaan[pembacaan.length - 1];
  const jedaPenutup = hingga
    ? new Date(hingga).getTime() - new Date(terakhir.created_at).getTime()
    : 0;

  if (jedaPenutup > ambang) {
    // Alat berhenti mengirim. Tutup periode di pembacaan terakhir yang
    // benar-benar kita punya, lalu catat keheningannya.
    tutup(terakhir.created_at);
    hasil.push({
      jenis: "DIAM",
      mulai: terakhir.created_at,
      selesai: null,
      durasiMs: jedaPenutup,
      puncakSuhu: null,
      puncakKelembapan: null,
      jumlahPembacaan: 0,
    });
  } else {
    // Benar-benar masih berlangsung: selesai dibiarkan null supaya tampilan
    // tidak mengarang waktu berakhir.
    tutup(null);
  }

  // Terbaru di atas, seperti catatan kejadian pada umumnya.
  return hasil.sort((a, b) => new Date(b.mulai).getTime() - new Date(a.mulai).getTime());
}

export function formatDurasi(ms: number) {
  const menit = Math.round(ms / 60000);
  if (menit < 1) return "kurang dari semenit";
  if (menit < 60) return `${menit} menit`;
  const jam = Math.floor(menit / 60);
  const sisaMenit = menit % 60;
  if (jam < 24) return sisaMenit ? `${jam} jam ${sisaMenit} menit` : `${jam} jam`;
  const hari = Math.floor(jam / 24);
  const sisaJam = jam % 24;
  return sisaJam ? `${hari} hari ${sisaJam} jam` : `${hari} hari`;
}
