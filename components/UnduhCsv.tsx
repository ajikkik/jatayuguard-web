"use client";

import { useEffect, useRef, useState } from "react";
import { IkonUnduh } from "@/components/Ikon";

// Rentang cepat memakai kode relatif, bukan tanggal mutlak: server yang
// menghitung waktunya, jadi hasilnya tetap bermakna "30 hari terakhir"
// kapan pun tombolnya ditekan.
const PRESET = {
  "24j": "24 jam",
  "7h": "7 hari",
  "30h": "30 hari",
  "90h": "90 hari",
} as const;

type KunciPreset = keyof typeof PRESET;

type Props = {
  /** Kalau diisi, ekspor dibatasi ke satu alat. Kosong = semua alat. */
  deviceId?: string;
  preset?: KunciPreset;
  className?: string;
};

/** YYYY-MM-DD dari tanggal lokal — toISOString() akan menggeser harinya. */
function tanggalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Ambil nama berkas dari Content-Disposition; server yang menamainya. */
function namaBerkasDari(header: string | null, cadangan: string) {
  const cocok = header?.match(/filename="?([^"]+)"?/i);
  return cocok?.[1] ?? cadangan;
}

export default function UnduhCsv({ deviceId, preset = "30h", className }: Props) {
  const [terbuka, setTerbuka] = useState(false);
  const [pilihan, setPilihan] = useState<KunciPreset | "khusus">(preset);
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const [hariIni, setHariIni] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [sukses, setSukses] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);

  // Tanggal diisi saat panel DIBUKA, bukan saat render: komponen ini ikut
  // dirender di server, dan tanggal di sana bisa berbeda hari dengan
  // browser pengguna sehingga hidrasi tidak cocok.
  function bukaTutup() {
    const akanBuka = !terbuka;
    if (akanBuka && !sampai) {
      const kini = new Date();
      const seminggu = new Date(kini.getTime() - 6 * 24 * 60 * 60 * 1000);
      setHariIni(tanggalInput(kini));
      setSampai(tanggalInput(kini));
      setDari(tanggalInput(seminggu));
    }
    setTerbuka(akanBuka);
  }

  // Panel menutup saat klik di luar atau tekan Escape — tanpa ini ia
  // menempel di layar dan menutupi isi halaman.
  useEffect(() => {
    if (!terbuka) return;

    function klikLuar(e: MouseEvent) {
      if (!panelRef.current?.contains(e.target as Node)) setTerbuka(false);
    }
    function tekanEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setTerbuka(false);
    }

    document.addEventListener("mousedown", klikLuar);
    document.addEventListener("keydown", tekanEsc);
    return () => {
      document.removeEventListener("mousedown", klikLuar);
      document.removeEventListener("keydown", tekanEsc);
    };
  }, [terbuka]);

  async function unduh() {
    setGalat(null);
    setSukses(null);

    const q = new URLSearchParams();
    if (deviceId) q.set("device", deviceId);

    if (pilihan === "khusus") {
      if (!dari || !sampai) {
        setGalat("Isi tanggal mulai dan tanggal akhir.");
        return;
      }
      if (dari > sampai) {
        setGalat("Tanggal mulai melewati tanggal akhir.");
        return;
      }
      q.set("dari", dari);
      q.set("sampai", sampai);
    } else {
      q.set("rentang", pilihan);
    }

    setSibuk(true);

    try {
      // Diambil lewat fetch, bukan tautan biasa, supaya penolakan server
      // (rentang terlalu besar, alat tidak ada) muncul sebagai kalimat di
      // sini. Dengan <a href> pengguna akan mendarat di halaman berisi
      // JSON mentah dan kehilangan halamannya.
      const res = await fetch(`/api/ekspor?${q.toString()}`);

      if (!res.ok) {
        const badan = await res.json().catch(() => null);
        setGalat(badan?.error ?? `Ekspor gagal (kode ${res.status}).`);
        return;
      }

      const jumlah = res.headers.get("X-Jumlah-Baris");
      const blob = await res.blob();
      const nama = namaBerkasDari(res.headers.get("Content-Disposition"), "jatayuguard.csv");

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nama;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      // Nol baris bukan kegagalan, tapi diam-diam mengunduh berkas kosong
      // membuat orang mengira datanya hilang. Jadi disebutkan.
      setSukses(
        jumlah === "0"
          ? "Tidak ada pembacaan pada rentang itu — berkasnya hanya berisi judul kolom."
          : `Terunduh ${Number(jumlah ?? 0).toLocaleString("id-ID")} baris.`
      );
    } catch {
      setGalat("Gagal menghubungi server. Periksa koneksi internetmu.");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div ref={panelRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={bukaTutup}
        aria-expanded={terbuka}
        className="inline-flex h-9 items-center gap-2 border border-[var(--line)] px-3 text-xs text-[var(--tinta-soft)] transition hover:border-[var(--soga)] hover:text-[var(--soga)]"
      >
        <IkonUnduh ukuran={14} />
        Unduh CSV
      </button>

      {terbuka && (
        /* Sengaja TIDAK memakai .kartu-kain: kelas itu memasang
           position: relative dan menang atas utility `absolute`, sehingga
           panelnya ikut alur dokumen dan mendorong isi halaman turun. */
        <div className="absolute right-0 z-20 mt-2 w-[min(20rem,calc(100vw-3rem))] border border-[var(--line)] bg-[var(--permukaan)] px-5 py-5 text-left shadow-lg">
          <h3 className="label-arsip mb-3 !text-[10px]">Rentang waktu</h3>

          <div className="mb-4 flex flex-wrap gap-2">
            {(Object.keys(PRESET) as KunciPreset[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setPilihan(k)}
                aria-pressed={pilihan === k}
                className={`inline-flex h-9 items-center border px-3 text-xs transition ${
                  pilihan === k
                    ? "border-[var(--soga)] text-[var(--soga)]"
                    : "border-[var(--line)] text-[var(--tinta-soft)] hover:border-[var(--soga)] hover:text-[var(--soga)]"
                }`}
              >
                {PRESET[k]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPilihan("khusus")}
              aria-pressed={pilihan === "khusus"}
              className={`inline-flex h-9 items-center border px-3 text-xs transition ${
                pilihan === "khusus"
                  ? "border-[var(--soga)] text-[var(--soga)]"
                  : "border-[var(--line)] text-[var(--tinta-soft)] hover:border-[var(--soga)] hover:text-[var(--soga)]"
              }`}
            >
              Pilih tanggal
            </button>
          </div>

          {pilihan === "khusus" && (
            <div className="mb-4 grid grid-cols-1 gap-3">
              <div>
                <label htmlFor="ekspor-dari" className="label-arsip mb-1.5 block !text-[10px]">
                  Dari tanggal
                </label>
                <input
                  id="ekspor-dari"
                  type="date"
                  value={dari}
                  max={sampai || hariIni}
                  onChange={(e) => setDari(e.target.value)}
                  className="w-full border border-[var(--line)] bg-[var(--input-bg)] h-10 px-3 text-sm outline-none focus:border-[var(--soga)]"
                />
              </div>
              <div>
                <label htmlFor="ekspor-sampai" className="label-arsip mb-1.5 block !text-[10px]">
                  Sampai tanggal
                </label>
                <input
                  id="ekspor-sampai"
                  type="date"
                  value={sampai}
                  min={dari || undefined}
                  max={hariIni}
                  onChange={(e) => setSampai(e.target.value)}
                  className="w-full border border-[var(--line)] bg-[var(--input-bg)] h-10 px-3 text-sm outline-none focus:border-[var(--soga)]"
                />
              </div>
              {/* Kedua tanggal ikut terpakai penuh; batas ini sering
                  disalahpahami sebagai "sampai tengah malam awal hari". */}
              <p className="text-xs text-[var(--tinta-soft)]">
                Kedua tanggal ikut disertakan, dari 00.00 sampai 23.59.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={unduh}
            disabled={sibuk}
            className="bg-[var(--soga)] inline-flex h-10 w-full items-center justify-center gap-2 px-4 text-sm font-medium text-[var(--kain)] transition hover:bg-[var(--soga-deep)] disabled:opacity-50"
          >
            <IkonUnduh ukuran={14} />
            {sibuk ? "Menyiapkan…" : deviceId ? "Unduh alat ini" : "Unduh semua alat"}
          </button>

          {galat && (
            <p
              role="alert"
              className="mt-3 border-l-2 border-[var(--bata)] bg-[var(--bata-bg)] px-3 py-2 text-xs text-[var(--bata)]"
            >
              {galat}
            </p>
          )}

          {sukses && (
            <p
              role="status"
              className="mt-3 border-l-2 border-[var(--indigo)] bg-[var(--indigo-bg)] px-3 py-2 text-xs text-[var(--indigo)]"
            >
              {sukses}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
