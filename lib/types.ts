export type Device = {
  id: string;
  device_id: string;
  nama: string;
  // Alat yang baru mendaftar sendiri belum tentu punya ambang batas.
  batas_suhu: number | null;
  batas_kelembapan: number | null;
  last_seen: string | null;
};

export type Reading = {
  device_id: string;
  // Sensor yang gagal baca menyimpan null, bukan 0. Membedakan keduanya
  // penting: 0°C adalah pembacaan, null adalah ketiadaan pembacaan.
  suhu: number | null;
  kelembapan: number | null;
  risk_index: number | null;
  status: string;
  created_at: string;
};
