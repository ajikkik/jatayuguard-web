// Helper tampilan angka & waktu, dipakai bersama oleh dashboard dan
// halaman detail alat supaya formatnya tidak berbeda-beda antar halaman.

const MENIT = 60_000;
const JAM = 60 * MENIT;
const HARI = 24 * JAM;

/**
 * Kolom numeric Postgres bisa kembali sebagai 31.400000000000002.
 * Semua angka sensor lewat sini dulu sebelum ditampilkan.
 */
export function formatAngka(nilai: number, desimal = 1) {
  return nilai.toLocaleString("id-ID", {
    minimumFractionDigits: desimal,
    maximumFractionDigits: desimal,
  });
}

/**
 * "baru saja" / "5 menit lalu" / "3 jam lalu" / "12 hari lalu".
 * Untuk alat pemantauan, umur data lebih penting daripada tanggal persisnya —
 * tanggal lengkap tetap tersedia lewat atribut title dan tabel riwayat.
 */
export function waktuRelatif(iso: string | null, sekarang = Date.now()) {
  if (!iso) return "belum ada data";

  const selisih = sekarang - new Date(iso).getTime();
  if (selisih < 0 || selisih < MENIT) return "baru saja";
  if (selisih < JAM) return `${Math.floor(selisih / MENIT)} menit lalu`;
  if (selisih < HARI) return `${Math.floor(selisih / JAM)} jam lalu`;
  return `${Math.floor(selisih / HARI)} hari lalu`;
}

/** Tanggal + jam lengkap, untuk tooltip dan kolom tabel. */
export function waktuLengkap(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
