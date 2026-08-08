export type Device = {
  id: string;
  device_id: string;
  nama: string;
  // Alat yang baru mendaftar sendiri belum tentu punya ambang batas.
  batas_suhu: number | null;
  batas_kelembapan: number | null;
  /** Ambang UV Index (skala WHO/WMO 0–11). Default firmware 1,0. */
  batas_uv: number | null;
  last_seen: string | null;
};

export type Reading = {
  device_id: string;
  // Firmware mengirim null saat SHT3x tidak terdeteksi. Membedakan null
  // dari 0 penting: 0°C adalah pembacaan, null adalah ketiadaan pembacaan.
  suhu: number | null;
  kelembapan: number | null;
  /**
   * UV Index 0,00–11,00. Firmware selalu mengirimnya (bacaUV() tidak
   * pernah gagal), tapi baris dari firmware lama tidak punya nilai ini.
   */
  nilai_uv: number | null;
  risk_index: number | null;
  status: string;
  created_at: string;
};
