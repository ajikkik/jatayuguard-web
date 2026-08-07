export type Device = {
  id: string;
  device_id: string;
  nama: string;
  batas_suhu: number;
  batas_kelembapan: number;
  last_seen: string | null;
};

export type Reading = {
  device_id: string;
  suhu: number;
  kelembapan: number;
  risk_index: number;
  status: string;
  created_at: string;
};
