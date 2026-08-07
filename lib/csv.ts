// Pemformatan CSV, dipisah dari route handler supaya bisa diuji sendiri.
// Bagian-bagian di sinilah yang menentukan file terbuka rapi atau berantakan
// di spreadsheet, jadi semuanya fungsi murni.

/**
 * Pemisah kolom TITIK KOMA, bukan koma.
 *
 * Angka Indonesia memakai koma sebagai pemisah desimal (30,3), jadi CSV
 * berpemisah koma akan memecah tiap angka jadi dua kolom. Titik koma juga
 * yang diharapkan Excel dengan regional Indonesia, sehingga file bisa
 * dibuka dengan klik dua kali tanpa wizard impor.
 */
export const PEMISAH = ";";

/**
 * BOM UTF-8. Tanpa ini Excel membaca berkas sebagai ANSI dan "°C" muncul
 * sebagai "Â°C".
 */
export const BOM = "﻿";

export function sel(nilai: string | number | null | undefined) {
  if (nilai === null || nilai === undefined) return "";
  const s = String(nilai);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Desimal koma supaya spreadsheet lokal mengenalinya sebagai angka, bukan teks. */
export function angka(nilai: number | null | undefined, desimal?: number) {
  if (nilai === null || nilai === undefined) return "";
  if (!Number.isFinite(nilai)) return "";
  const n = desimal === undefined ? nilai : Number(nilai.toFixed(desimal));
  return String(n).replace(".", ",");
}

/** DD/MM/YYYY HH.MM — format yang dikenali Excel dengan regional Indonesia. */
export function waktuLokal(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(
    d.getUTCHours()
  )}.${p(d.getUTCMinutes())}`;
}

export function barisCsv(kolom: (string | number | null | undefined)[]) {
  return kolom.map(sel).join(PEMISAH);
}

/** Gabungkan jadi berkas utuh: BOM + CRLF antar baris + newline penutup. */
export function berkasCsv(baris: string[]) {
  return BOM + baris.join("\r\n") + "\r\n";
}
