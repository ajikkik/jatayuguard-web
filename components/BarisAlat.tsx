import Link from "next/link";
import { formatAngka, waktuLengkap, waktuRelatif } from "@/lib/format";
import { LABEL_KONDISI, SEGEL_KONDISI, type KondisiAlat } from "@/lib/status";
import type { Device, Reading } from "@/lib/types";

type Props = {
  device: Device;
  reading?: Reading;
  kondisi: KondisiAlat;
};

/**
 * Satu alat sebagai baris padat (~64px) alih-alih kartu (~200px).
 * Dipakai saat alat sudah banyak, ketika membandingkan antar-alat lebih
 * penting daripada memberi tiap alat ruangnya sendiri.
 */
export default function BarisAlat({ device, reading, kondisi }: Props) {
  const diam = kondisi === "DIAM" || kondisi === "KOSONG";
  const suhuLewat =
    reading?.suhu != null && device.batas_suhu != null && reading.suhu > device.batas_suhu;
  const humLewat =
    reading?.kelembapan != null &&
    device.batas_kelembapan != null &&
    reading.kelembapan > device.batas_kelembapan;

  function warnaNilai(lewat: boolean) {
    if (diam) return "text-[var(--tinta-soft)]";
    return lewat ? "text-[var(--bata)]" : "text-[var(--tinta)]";
  }

  return (
    <Link
      href={`/device/${device.device_id}`}
      className="group grid grid-cols-1 items-center gap-x-4 gap-y-1 px-4 py-3 transition hover:bg-[var(--kain-dim)] sm:grid-cols-[minmax(0,1.7fr)_repeat(3,minmax(0,1fr))]"
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={`segel-status ${SEGEL_KONDISI[kondisi]}`} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--tinta)] transition group-hover:text-[var(--soga)]">
            {device.nama || device.device_id}
          </p>
          <p className="text-[11px] text-[var(--tinta-soft)]">{LABEL_KONDISI[kondisi]}</p>
        </div>
      </div>

      <div className="text-sm">
        <span className="label-arsip mr-2 !text-[10px] sm:hidden">Suhu</span>
        {reading ? (
          <>
            <span className={warnaNilai(suhuLewat)}>{formatAngka(reading.suhu)}°C</span>
            {device.batas_suhu != null && (
              <span className="ml-2 text-[11px] text-[var(--tinta-soft)]">
                / {formatAngka(device.batas_suhu)}
              </span>
            )}
          </>
        ) : (
          <span className="text-[var(--tinta-soft)]">—</span>
        )}
      </div>

      <div className="text-sm">
        <span className="label-arsip mr-2 !text-[10px] sm:hidden">Kelembapan</span>
        {reading ? (
          <>
            <span className={warnaNilai(humLewat)}>{formatAngka(reading.kelembapan)}%</span>
            {device.batas_kelembapan != null && (
              <span className="ml-2 text-[11px] text-[var(--tinta-soft)]">
                / {formatAngka(device.batas_kelembapan)}
              </span>
            )}
          </>
        ) : (
          <span className="text-[var(--tinta-soft)]">—</span>
        )}
      </div>

      <div
        className="text-[11px] text-[var(--tinta-soft)]"
        title={reading ? waktuLengkap(reading.created_at) : undefined}
      >
        {reading ? waktuRelatif(reading.created_at) : "belum ada data"}
      </div>
    </Link>
  );
}
