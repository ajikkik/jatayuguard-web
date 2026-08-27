// Titik grafik tren, hasil peringkasan per ember waktu di server.
// Dipakai bersama oleh route /api/tren dan halaman alat supaya bentuk
// datanya tidak bisa berbeda antara yang dikirim dan yang digambar.

/** Banyaknya ember waktu yang diminta. Cukup rapat untuk lebar grafik mana pun. */
export const JUMLAH_EMBER = 240;

export type TitikTren = {
  /** Waktu pembacaan terakhir dalam ember, milidetik epoch. */
  waktu: number;
  suhu: number | null;
  kelembapan: number | null;
  uv: number | null;
  /** Banyaknya pembacaan yang dirata-ratakan menjadi titik ini. */
  jumlah: number;
};

export type JawabanTren = {
  rentang: string;
  sejak: string;
  sampai: string;
  sumber: "rpc" | "cadangan";
  /** Total pembacaan dalam rentang, sebelum diringkas jadi titik. */
  jumlahPembacaan: number;
  titik: TitikTren[];
};
