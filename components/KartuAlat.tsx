import Link from "next/link";
import { formatAngka, waktuLengkap, waktuRelatif } from "@/lib/format";
import { LABEL_KONDISI, lewatBatas, SEGEL_KONDISI, type KondisiAlat } from "@/lib/status";
import type { RataAlat } from "@/lib/rata";
import type { Device, Reading } from "@/lib/types";

type Props = {
  device: Device;
  reading?: Reading;
  kondisi: KondisiAlat;
  /** Rata-rata alat ini pada rentang terpilih; tidak ada = belum dimuat. */
  rata?: RataAlat;
  labelRentang?: string;
};

export default function KartuAlat({ device, reading, kondisi, rata, labelRentang }: Props) {
  const diam = kondisi === "DIAM" || kondisi === "KOSONG";

  const suhuLewat = lewatBatas(reading?.suhu, device.batas_suhu);
  const humLewat = lewatBatas(reading?.kelembapan, device.batas_kelembapan);
  const uvLewat = lewatBatas(reading?.nilai_uv, device.batas_uv);

  // UV baru ada sejak firmware v2. Alat yang masih firmware lama tidak
  // mengirimnya sama sekali, jadi kolomnya disembunyikan alih-alih
  // memajang sel kosong permanen.
  const adaUV = reading?.nilai_uv != null;

  // Warna bata dipakai untuk keadaan yang berlaku SEKARANG. Pembacaan dari
  // alat yang sudah diam berminggu-minggu tetap ditampilkan sebagai fakta,
  // tapi diredam supaya tidak terbaca sebagai keadaan darurat yang aktif.
  function warnaNilai(lewat: boolean) {
    if (diam) return "text-[var(--tinta-soft)]";
    return lewat ? "text-[var(--bata)]" : "text-[var(--tinta)]";
  }

  /**
   * Baris rata-rata di bawah nilai sekarang. Sengaja diredam: yang menuntut
   * tindakan adalah angka sekarang, rata-rata hanya memberi konteks apakah
   * angka itu wajar untuk alat ini.
   *
   * Hanya dirender kalau besaran itu benar-benar punya rata-rata; alat yang
   * sensor UV-nya mati tidak perlu memajang "rata —".
   */
  function barisRata(nilai: number | null | undefined, desimal = 1) {
    if (nilai == null) return null;
    return (
      <p className="mt-0.5 text-[11px] text-[var(--tinta-soft)]">rata {formatAngka(nilai, desimal)}</p>
    );
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

      {/* Nama alat diisi pengguna. Nama panjang tanpa spasi akan memaksa
          lebarnya sendiri dan menembus kartu, sama seperti URL di profil. */}
      <h3 className="judul mb-0.5 break-words text-lg text-[var(--tinta)] transition group-hover:text-[var(--soga)]">
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
          className={`mt-auto grid gap-px border border-[var(--line)] bg-[var(--line)] text-sm ${
            adaUV ? "grid-cols-3" : "grid-cols-2"
          }`}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          <div className="bg-[var(--permukaan)] px-3 py-2">
            <p className="label-arsip mb-0.5 !text-[10px]">Suhu</p>
            <p className={`font-medium ${warnaNilai(suhuLewat)}`}>{formatAngka(reading.suhu)}°C</p>
            {device.batas_suhu != null && (
              <p className={`mt-0.5 text-[11px] ${warnaNilai(suhuLewat)} opacity-90`}>
                {suhuLewat ? "lewat" : "batas"} {formatAngka(device.batas_suhu)}
              </p>
            )}
            {barisRata(rata?.suhu)}
          </div>

          <div className="bg-[var(--permukaan)] px-3 py-2">
            <p className="label-arsip mb-0.5 !text-[10px]">Lembap</p>
            <p className={`font-medium ${warnaNilai(humLewat)}`}>{formatAngka(reading.kelembapan)}%</p>
            {device.batas_kelembapan != null && (
              <p className={`mt-0.5 text-[11px] ${warnaNilai(humLewat)} opacity-90`}>
                {humLewat ? "lewat" : "batas"} {formatAngka(device.batas_kelembapan)}
              </p>
            )}
            {barisRata(rata?.kelembapan)}
          </div>

          {adaUV && (
            <div className="bg-[var(--permukaan)] px-3 py-2">
              <p className="label-arsip mb-0.5 !text-[10px]">UV</p>
              {/* Dua desimal: ambangnya 1,0-2,0 dan lantai deteksi sensor
                  sekitar 0,05, jadi satu desimal menyembunyikan perbedaan
                  yang justru menentukan. */}
              <p className={`font-medium ${warnaNilai(uvLewat)}`}>{formatAngka(reading.nilai_uv, 2)}</p>
              {device.batas_uv != null && (
                <p className={`mt-0.5 text-[11px] ${warnaNilai(uvLewat)} opacity-90`}>
                  {uvLewat ? "lewat" : "batas"} {formatAngka(device.batas_uv, 1)}
                </p>
              )}
              {barisRata(rata?.uv, 2)}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-auto text-sm text-[var(--tinta-soft)]">Menunggu data pertama…</p>
      )}

      {/* Kata "rata" di dalam sel terlalu pendek untuk berdiri sendiri —
          tanpa keterangan ini pembaca tidak tahu rata-rata rentang mana,
          dan berapa banyak pembacaan yang mendasarinya.

          Untuk alat yang diam, kalimatnya berubah: alat mati tidak menulis
          baris apa pun, jadi angkanya hanya mencakup waktu saat alat masih
          hidup. Menyebutnya "rata-rata 30 hari" akan mengarang pemantauan
          yang tidak pernah terjadi. */}
      {reading && rata && rata.jumlah > 0 && (
        <p className="mt-2 text-[11px] text-[var(--tinta-soft)]">
          rata = rata-rata {diam ? "saat alat masih aktif dalam " : ""}
          {labelRentang} terakhir, {rata.jumlah.toLocaleString("id-ID")} pembacaan
        </p>
      )}
    </Link>
  );
}
