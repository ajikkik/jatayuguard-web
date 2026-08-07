// Penentuan kondisi alat.
//
// Titik pentingnya: alat yang berhenti mengirim data TIDAK boleh mewarisi
// status pembacaan terakhirnya. Sebelumnya alat yang diam 22 hari dengan
// pembacaan terakhir BAHAYA tetap dilaporkan "kondisi kritis, perlu
// perhatian segera" — padahal yang benar-benar kita ketahui hanyalah
// bahwa alatnya diam. Mencampur "kondisi terakhir yang diketahui" dengan
// "kondisi sekarang" adalah cara tercepat membuat orang berhenti
// mempercayai alat pemantauannya.

export type KondisiAlat = "BAHAYA" | "DIAM" | "WASPADA" | "AMAN" | "KOSONG";

export const AMBANG_ONLINE_MS = 2 * 60 * 1000;

export function isOnline(waktuTerakhir: string | null, sekarang = Date.now()) {
  if (!waktuTerakhir) return false;
  return sekarang - new Date(waktuTerakhir).getTime() < AMBANG_ONLINE_MS;
}

export function kondisiAlat(
  statusPembacaan: string | undefined,
  waktuTerakhir: string | null,
  sekarang = Date.now()
): KondisiAlat {
  if (!waktuTerakhir || !statusPembacaan) return "KOSONG";
  if (!isOnline(waktuTerakhir, sekarang)) return "DIAM";
  if (statusPembacaan === "BAHAYA") return "BAHAYA";
  if (statusPembacaan === "WASPADA") return "WASPADA";
  return "AMAN";
}

// Alat yang diam diperingkat di atas WASPADA: alat yang masih melapor
// "perlu diawasi" setidaknya masih memberi kita informasi, sedangkan alat
// yang diam adalah titik buta.
export const PERINGKAT: Record<KondisiAlat, number> = {
  BAHAYA: 0,
  DIAM: 1,
  KOSONG: 2,
  WASPADA: 3,
  AMAN: 4,
};

export const LABEL_KONDISI: Record<KondisiAlat, string> = {
  BAHAYA: "Kondisi kritis",
  DIAM: "Tidak mengirim data",
  KOSONG: "Belum ada data",
  WASPADA: "Perlu diawasi",
  AMAN: "Kondisi aman",
};

export const SEGEL_KONDISI: Record<KondisiAlat, string> = {
  BAHAYA: "segel-bahaya",
  DIAM: "segel-diam",
  KOSONG: "segel-diam",
  WASPADA: "segel-waspada",
  AMAN: "segel-aman",
};

/** Kondisi yang menuntut perhatian sekarang, dipakai untuk strip peringatan. */
export function perluPerhatian(k: KondisiAlat) {
  return k === "BAHAYA" || k === "DIAM" || k === "KOSONG";
}
