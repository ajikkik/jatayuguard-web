// Rentang untuk rata-rata pembacaan di dashboard. Dipakai bersama oleh
// halaman dashboard dan route API-nya supaya kunci rentang tidak bisa
// berbeda antara yang diminta dan yang dilayani.

export const RENTANG_RATA = {
  "24j": { label: "24 jam", ms: 24 * 60 * 60 * 1000 },
  "7h": { label: "7 hari", ms: 7 * 24 * 60 * 60 * 1000 },
  "30h": { label: "30 hari", ms: 30 * 24 * 60 * 60 * 1000 },
} as const;

export type KunciRentangRata = keyof typeof RENTANG_RATA;

/** Rata-rata satu alat pada satu rentang. null = tidak ada nilai terukur. */
export type RataAlat = {
  suhu: number | null;
  kelembapan: number | null;
  uv: number | null;
  /** Banyaknya pembacaan yang mendasari angka di atas. */
  jumlah: number;
};
