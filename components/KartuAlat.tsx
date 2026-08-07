import Link from "next/link";
import { formatAngka, waktuLengkap, waktuRelatif } from "@/lib/format";
import { LABEL_KONDISI, SEGEL_KONDISI, type KondisiAlat } from "@/lib/status";
import type { Device, Reading } from "@/lib/types";

type Props = {
  device: Device;
  reading?: Reading;
  kondisi: KondisiAlat;
};

export default function KartuAlat({ device, reading, kondisi }: Props) {
  const diam = kondisi === "DIAM" || kondisi === "KOSONG";

  const suhuLewat = !!reading && device.batas_suhu != null && reading.suhu > device.batas_suhu;
  const humLewat =
    !!reading && device.batas_kelembapan != null && reading.kelembapan > device.batas_kelembapan;

  // Warna bata dipakai untuk keadaan yang berlaku SEKARANG. Pembacaan dari
  // alat yang sudah diam berminggu-minggu tetap ditampilkan sebagai fakta,
  // tapi diredam supaya tidak terbaca sebagai keadaan darurat yang aktif.
  function warnaNilai(lewat: boolean) {
    if (diam) return "text-[var(--tinta-soft)]";
    return lewat ? "text-[var(--bata)]" : "text-[var(--tinta)]";
  }

  return (
    <Link
      href={`/device/${device.device_id}`}
      className="kartu-kain group flex flex-col px-5 py-4 transition hover:border-[var(--soga)]"
    >
      <div className="mb-3 flex items-center gap-2.5">
        <span className={`segel-status ${SEGEL_KONDISI[kondisi]}`} />
        <span className="label-arsip !text-[10px]">{LABEL_KONDISI[kondisi]}</span>
      </div>

      <h3 className="judul mb-0.5 text-lg text-[var(--tinta)] transition group-hover:text-[var(--soga)]">
        {device.nama || device.device_id}
      </h3>

      <p
        className="mb-3 text-xs text-[var(--tinta-soft)]"
        title={reading ? waktuLengkap(reading.created_at) : undefined}
      >
        {reading
          ? `${diam ? "Terakhir diketahui" : "Diperbarui"} ${waktuRelatif(reading.created_at)}`
          : "Belum pernah mengirim data"}
      </p>

      {reading ? (
        <div
          className="mt-auto grid grid-cols-2 gap-px border border-[var(--line)] bg-[var(--line)] text-sm"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          <div className="bg-[var(--permukaan)] px-3 py-2">
            <p className="label-arsip mb-0.5 !text-[10px]">Suhu</p>
            <p className={`font-medium ${warnaNilai(suhuLewat)}`}>{formatAngka(reading.suhu)}°C</p>
            {device.batas_suhu != null && (
              <p className={`mt-0.5 text-[11px] ${warnaNilai(suhuLewat)} opacity-90`}>
                {suhuLewat ? "lewat batas" : "batas"} {formatAngka(device.batas_suhu)}°C
              </p>
            )}
          </div>
          <div className="bg-[var(--permukaan)] px-3 py-2">
            <p className="label-arsip mb-0.5 !text-[10px]">Kelembapan</p>
            <p className={`font-medium ${warnaNilai(humLewat)}`}>{formatAngka(reading.kelembapan)}%</p>
            {device.batas_kelembapan != null && (
              <p className={`mt-0.5 text-[11px] ${warnaNilai(humLewat)} opacity-90`}>
                {humLewat ? "lewat batas" : "batas"} {formatAngka(device.batas_kelembapan)}%
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-auto text-sm text-[var(--tinta-soft)]">Menunggu data pertama…</p>
      )}
    </Link>
  );
}
