"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatAngka } from "@/lib/format";

export type TitikTren = { waktu: number; nilai: number };

type Props = {
  judul: string;
  satuan: string;
  data: TitikTren[];
  /** Ambang batas alat; digambar sebagai garis acuan putus-putus. */
  batas: number | null;
  /**
   * Rata-rata seluruh rentang, digambar sebagai garis acuan tipis.
   * Dihitung di server dari SEMUA pembacaan dalam rentang, bukan dari titik
   * yang digambar di sini — grafik dibatasi 1.500 baris dan titiknya sudah
   * diringkas per kelompok, jadi merata-ratakannya lagi bukan rata-rata
   * rentang yang sebenarnya.
   */
  rata?: number | null;
  /** Warna garis, mis. "var(--soga)". Satu seri per grafik. */
  warna: string;
  formatWaktu: (t: number) => string;
  formatWaktuPanjang: (t: number) => string;
  memuat?: boolean;
  /** Angka di belakang koma untuk nilai. UV Index butuh 2, suhu cukup 1. */
  desimal?: number;
  /**
   * Batas bawah sumbu. Besaran fisik yang tidak bisa negatif (kelembapan,
   * UV Index) harus dikunci di 0 — tanpa ini ruang napas domain menarik
   * sumbunya ke angka minus yang mustahil.
   */
  minimum?: number;
};

const TINGGI = 210;
const PAD = { atas: 16, kanan: 20, bawah: 30, kiri: 46 };

// Tangga nilai "bulat" (1 / 2 / 2.5 / 5 / 10 x 10^n) supaya label sumbu Y
// jatuh di angka yang enak dibaca, bukan 28.7331.
function langkahBulat(kasar: number) {
  if (kasar <= 0) return 1;
  const pangkat = Math.pow(10, Math.floor(Math.log10(kasar)));
  const sisa = kasar / pangkat;
  const pengali = sisa <= 1 ? 1 : sisa <= 2 ? 2 : sisa <= 2.5 ? 2.5 : sisa <= 5 ? 5 : 10;
  return pengali * pangkat;
}

function hitungTick(lo: number, hi: number, target = 4) {
  const langkah = langkahBulat((hi - lo) / target);
  const mulai = Math.floor(lo / langkah) * langkah;
  const tick: number[] = [];
  for (let v = mulai; v <= hi + langkah / 1000; v += langkah) tick.push(+v.toFixed(6));
  return tick;
}

export default function GrafikTren({
  judul,
  satuan,
  data,
  batas,
  rata,
  warna,
  formatWaktu,
  formatWaktuPanjang,
  memuat = false,
  desimal = 1,
  minimum,
}: Props) {
  const wadahRef = useRef<HTMLDivElement>(null);
  const [lebar, setLebar] = useState(0);
  const [aktif, setAktif] = useState<number | null>(null);

  // SVG digambar pada koordinat piksel asli, bukan viewBox yang diskalakan.
  // Kalau pakai viewBox, label sumbu ikut mengecil di layar sempit sampai
  // tak terbaca; dengan cara ini 11px tetap 11px di lebar berapa pun.
  useEffect(() => {
    const el = wadahRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entri]) => setLebar(entri.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    if (!lebar || data.length === 0) return null;

    const plotW = Math.max(lebar - PAD.kiri - PAD.kanan, 10);
    const plotH = TINGGI - PAD.atas - PAD.bawah;

    let lo = Math.min(...data.map((d) => d.nilai));
    let hi = Math.max(...data.map((d) => d.nilai));
    // Ambang batas harus ikut masuk domain, kalau tidak garisnya jatuh
    // di luar area gambar dan user tidak bisa melihat seberapa jauh
    // nilai sekarang dari batasnya.
    if (batas != null) {
      lo = Math.min(lo, batas);
      hi = Math.max(hi, batas);
    }
    // Rata-rata datang dari seluruh rentang, sedangkan grafik bisa hanya
    // memuat sebagiannya. Jadi nilainya tidak dijamin berada di antara
    // titik yang tergambar, dan domainnya harus ikut melebar.
    if (rata != null) {
      lo = Math.min(lo, rata);
      hi = Math.max(hi, rata);
    }
    if (lo === hi) {
      lo -= 1;
      hi += 1;
    }
    const napas = (hi - lo) * 0.12;
    let bawah = lo - napas;
    if (minimum !== undefined) bawah = Math.max(bawah, minimum);
    const tick = hitungTick(bawah, hi + napas).filter(
      (t) => minimum === undefined || t >= minimum
    );
    const domLo = Math.min(tick[0] ?? bawah, bawah);
    const domHi = Math.max(tick[tick.length - 1] ?? hi, hi + napas);

    const xAt = (i: number) =>
      data.length === 1 ? PAD.kiri + plotW / 2 : PAD.kiri + (i / (data.length - 1)) * plotW;
    const yAt = (v: number) => PAD.atas + (1 - (v - domLo) / (domHi - domLo)) * plotH;

    const garis = data.map((d, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(d.nilai).toFixed(1)}`).join(" ");
    const dasar = PAD.atas + plotH;
    const isian =
      data.length > 1
        ? `${garis} L${xAt(data.length - 1).toFixed(1)},${dasar} L${xAt(0).toFixed(1)},${dasar} Z`
        : "";

    return { plotW, plotH, tick, domLo, domHi, xAt, yAt, garis, isian, dasar };
  }, [lebar, data, batas, rata, minimum]);

  const terakhir = data[data.length - 1];
  const titikAktif = aktif != null ? data[aktif] : null;

  function pilihTerdekat(clientX: number) {
    if (!geo || !wadahRef.current || data.length === 0) return;
    const kotak = wadahRef.current.getBoundingClientRect();
    const x = clientX - kotak.left;
    if (data.length === 1) return setAktif(0);
    const frac = (x - PAD.kiri) / geo.plotW;
    const i = Math.round(frac * (data.length - 1));
    setAktif(Math.min(Math.max(i, 0), data.length - 1));
  }

  function handleKey(e: React.KeyboardEvent) {
    if (data.length === 0) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const arah = e.key === "ArrowRight" ? 1 : -1;
      setAktif((p) => {
        const dasar = p ?? data.length - 1;
        return Math.min(Math.max(dasar + arah, 0), data.length - 1);
      });
    } else if (e.key === "Home") {
      e.preventDefault();
      setAktif(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setAktif(data.length - 1);
    } else if (e.key === "Escape") {
      setAktif(null);
    }
  }

  const ringkasan =
    data.length === 0
      ? `Grafik ${judul}: belum ada data.`
      : `Grafik ${judul} dari ${data.length} pembacaan. Terendah ${formatAngka(
          Math.min(...data.map((d) => d.nilai)), desimal
        )}${satuan}, tertinggi ${formatAngka(Math.max(...data.map((d) => d.nilai)), desimal)}${satuan}, terakhir ${formatAngka(
          terakhir?.nilai ?? 0, desimal
        )}${satuan}.${rata != null ? ` Rata-rata rentang ${formatAngka(rata, desimal)}${satuan}.` : ""}${
          batas != null ? ` Ambang batas ${formatAngka(batas, desimal)}${satuan}.` : ""
        }`;

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="label-arsip">
          {satuan ? `${judul} (${satuan})` : judul}
        </h3>
        <span className="flex items-baseline gap-3 text-[11px] text-[var(--tinta-soft)]">
          {rata != null && (
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              rata-rata {formatAngka(rata, desimal)}
              {satuan}
            </span>
          )}
          {batas != null && (
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              batas {formatAngka(batas, desimal)}
              {satuan}
            </span>
          )}
        </span>
      </div>

      <div
        ref={wadahRef}
        className="relative w-full"
        style={{ minHeight: TINGGI }}
        onPointerMove={(e) => pilihTerdekat(e.clientX)}
        onPointerLeave={() => setAktif(null)}
      >
        {data.length === 0 ? (
          <div className="flex h-[210px] items-center justify-center border border-[var(--line)] text-sm text-[var(--tinta-soft)]">
            Belum ada pembacaan pada rentang ini.
          </div>
        ) : (
          geo && (
            <svg
              width={lebar}
              height={TINGGI}
              tabIndex={0}
              role="img"
              aria-label={ringkasan}
              onKeyDown={handleKey}
              onBlur={() => setAktif(null)}
              className="block touch-manipulation outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--soga)]"
              style={{ opacity: memuat ? 0.45 : 1 }}
            >
              {/* Garis bantu: hairline solid, satu tingkat dari latar, tidak menonjol */}
              {geo.tick.map((t) => {
                const y = geo.yAt(t);
                if (y < PAD.atas - 1 || y > geo.dasar + 1) return null;
                return (
                  <g key={t}>
                    <line
                      x1={PAD.kiri}
                      x2={lebar - PAD.kanan}
                      y1={y}
                      y2={y}
                      stroke="var(--line-halus)"
                      strokeWidth={1}
                    />
                    <text
                      x={PAD.kiri - 8}
                      y={y}
                      textAnchor="end"
                      dominantBaseline="middle"
                      fontSize={11}
                      fill="var(--tinta-soft)"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {formatAngka(t, Number.isInteger(t) ? 0 : 1)}
                    </text>
                  </g>
                );
              })}

              {/* Wash 10% di bawah garis — bukan blok pekat */}
              {geo.isian && <path d={geo.isian} fill={warna} opacity={0.1} />}

              {/* Garis rata-rata. Sengaja dibedakan tegas dari garis ambang:
                  putus-putusnya lebih rapat, warnanya netral, dan tebalnya
                  separuh. Dua garis acuan yang mirip di satu grafik akan
                  saling tertukar — dan tertukar antara "rata-rata" dengan
                  "batas bahaya" adalah kekeliruan yang mahal. */}
              {rata != null && (
                <>
                  <line
                    x1={PAD.kiri}
                    x2={lebar - PAD.kanan}
                    y1={geo.yAt(rata)}
                    y2={geo.yAt(rata)}
                    stroke="var(--tinta-soft)"
                    strokeWidth={1}
                    strokeDasharray="2 3"
                  />
                  <text
                    x={PAD.kiri + 4}
                    y={geo.yAt(rata) - 4}
                    fontSize={10}
                    fill="var(--tinta-soft)"
                  >
                    rata-rata
                  </text>
                </>
              )}

              {/* Garis ambang batas: putus-putus DISENGAJA, karena ini memang
                  ambang, bukan garis bantu biasa */}
              {batas != null && (
                <line
                  x1={PAD.kiri}
                  x2={lebar - PAD.kanan}
                  y1={geo.yAt(batas)}
                  y2={geo.yAt(batas)}
                  stroke="var(--bata)"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                />
              )}

              <path
                d={geo.garis}
                fill="none"
                stroke={warna}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {/* Label langsung hanya di titik akhir — bukan di setiap titik */}
              {terakhir && (
                <>
                  <circle
                    cx={geo.xAt(data.length - 1)}
                    cy={geo.yAt(terakhir.nilai)}
                    r={4}
                    fill={warna}
                    stroke="var(--permukaan)"
                    strokeWidth={2}
                  />
                  <text
                    x={geo.xAt(data.length - 1)}
                    y={geo.yAt(terakhir.nilai) - 12}
                    textAnchor="end"
                    fontSize={11}
                    fontWeight={600}
                    fill="var(--tinta)"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {formatAngka(terakhir.nilai, desimal)}
                    {satuan}
                  </text>
                </>
              )}

              {/* Sumbu waktu: cukup ujung-ujung (dan tengah kalau muat) */}
              {[0, ...(lebar > 420 && data.length > 2 ? [Math.floor((data.length - 1) / 2)] : []), data.length - 1]
                .filter((v, i, a) => a.indexOf(v) === i)
                .map((i) => (
                  <text
                    key={i}
                    x={geo.xAt(i)}
                    y={TINGGI - 10}
                    textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
                    fontSize={11}
                    fill="var(--tinta-soft)"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {formatWaktu(data[i].waktu)}
                  </text>
                ))}

              {/* Crosshair: pembaca membidik waktu, bukan garis 2px */}
              {titikAktif && aktif != null && (
                <>
                  <line
                    x1={geo.xAt(aktif)}
                    x2={geo.xAt(aktif)}
                    y1={PAD.atas}
                    y2={geo.dasar}
                    stroke="var(--tinta-soft)"
                    strokeWidth={1}
                  />
                  <circle
                    cx={geo.xAt(aktif)}
                    cy={geo.yAt(titikAktif.nilai)}
                    r={4.5}
                    fill={warna}
                    stroke="var(--permukaan)"
                    strokeWidth={2}
                  />
                </>
              )}
            </svg>
          )
        )}

        {/* Tooltip: nilai memimpin, keterangan mengikuti */}
        {titikAktif && aktif != null && geo && (
          <div
            className="pointer-events-none absolute z-10 border border-[var(--line)] bg-[var(--permukaan)] px-2.5 py-1.5 text-xs shadow-sm"
            style={{
              left: Math.min(Math.max(geo.xAt(aktif), 60), Math.max(lebar - 60, 60)),
              top: 0,
              transform: "translateX(-50%)",
            }}
          >
            <span
              className="font-semibold text-[var(--tinta)]"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatAngka(titikAktif.nilai, desimal)}
              {satuan}
            </span>
            <span className="ml-2 text-[var(--tinta-soft)]">{formatWaktuPanjang(titikAktif.waktu)}</span>
          </div>
        )}
      </div>

      {/* Pembacaan aktif diumumkan ke screen reader, sama isinya dengan tooltip */}
      <p aria-live="polite" className="sr-only">
        {titikAktif
          ? `${judul} ${formatAngka(titikAktif.nilai, desimal)}${satuan} pada ${formatWaktuPanjang(titikAktif.waktu)}`
          : ""}
      </p>
    </div>
  );
}
