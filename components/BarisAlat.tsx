import Link from "next/link";
import { formatAngka, waktuLengkap, waktuRelatif } from "@/lib/format";
import { LABEL_KONDISI, lewatBatas, SEGEL_KONDISI, type KondisiAlat } from "@/lib/status";
import type { Device, Reading } from "@/lib/types";

type Props = {
  device: Device;
  reading?: Reading;
  kondisi: KondisiAlat;
};

/**
 * Warna bata dipakai untuk keadaan yang berlaku SEKARANG. Pembacaan dari
 * alat yang sudah diam berminggu-minggu tetap ditampilkan sebagai fakta,
 * tapi diredam supaya tidak terbaca sebagai keadaan darurat yang aktif.
 */
function warnaNilai(diam: boolean, lewat: boolean) {
  if (diam) return "text-[var(--tinta-soft)]";
  return lewat ? "text-[var(--bata)]" : "text-[var(--tinta)]";
}

/**
 * Satu sel ukur: nilai + ambangnya, atau tanda "tidak ada".
 *
 * Dideklarasikan di LUAR BarisAlat. Komponen yang dibuat di dalam render
 * adalah komponen baru setiap render, sehingga React me-remount-nya dan
 * mereset state-nya alih-alih memperbaruinya.
 */
function Sel({
  label,
  nilai,
  satuan,
  batas,
  lewat,
  diam,
  desimal = 1,
}: {
  label: string;
  nilai: number | null | undefined;
  satuan: string;
  batas: number | null;
  lewat: boolean;
  diam: boolean;
  desimal?: number;
}) {
  return (
    <div className="text-sm">
      <span className="label-arsip mr-2 !text-[10px] sm:hidden">{label}</span>
      {nilai != null ? (
        <>
          <span className={warnaNilai(diam, lewat)}>
            {formatAngka(nilai, desimal)}
            {satuan}
          </span>
          {batas != null && (
            <span className="ml-2 text-[11px] text-[var(--tinta-soft)]">
              / {formatAngka(batas, desimal)}
            </span>
          )}
        </>
      ) : (
        <span className="text-[var(--tinta-soft)]">—</span>
      )}
    </div>
  );
}

/**
 * Satu alat sebagai baris padat (~64px) alih-alih kartu (~200px).
 * Dipakai saat alat sudah banyak, ketika membandingkan antar-alat lebih
 * penting daripada memberi tiap alat ruangnya sendiri.
 */
export default function BarisAlat({ device, reading, kondisi }: Props) {
  const diam = kondisi === "DIAM" || kondisi === "KOSONG";
  const suhuLewat = lewatBatas(reading?.suhu, device.batas_suhu);
  const humLewat = lewatBatas(reading?.kelembapan, device.batas_kelembapan);
  const uvLewat = lewatBatas(reading?.nilai_uv, device.batas_uv);

  return (
    <Link
      href={`/device/${device.device_id}`}
      className="group grid grid-cols-1 items-center gap-x-4 gap-y-1 px-4 py-3 transition hover:bg-[var(--kain-dim)] sm:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))]"
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

      <Sel label="Suhu" nilai={reading?.suhu} satuan="°C" batas={device.batas_suhu} lewat={suhuLewat} diam={diam} />
      <Sel
        label="Kelembapan"
        nilai={reading?.kelembapan}
        satuan="%"
        batas={device.batas_kelembapan}
        lewat={humLewat}
        diam={diam}
      />
      <Sel
        label="UV Index"
        nilai={reading?.nilai_uv}
        satuan=""
        batas={device.batas_uv}
        lewat={uvLewat}
        diam={diam}
        desimal={2}
      />

      <div
        className="text-[11px] text-[var(--tinta-soft)]"
        title={reading ? waktuLengkap(reading.created_at) : undefined}
      >
        {reading ? waktuRelatif(reading.created_at) : "belum ada data"}
      </div>
    </Link>
  );
}
